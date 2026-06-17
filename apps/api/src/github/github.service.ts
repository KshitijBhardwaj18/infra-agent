import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { ProjectsService } from "../projects/projects.service";
import { GithubTokenService } from "./github-token.service";
import { IndexingSseService } from "./indexing-sse.service";
import { signState, type GithubStatePayload } from "./state";
import { getInstallationManageUrl } from "@heizen/infra-core";
import { env } from "../common/env";

export type ReturnEnv = "staging" | "production";

const VALID_ENVS: ReadonlySet<string> = new Set(["staging", "production"]);

/**
 * Default environment to index/read against when none is specified. Prefers
 * the conventional "staging" slug, then any staging-tier env, then the first
 * env — so projects without a literal staging env (only custom ones) still
 * resolve a sensible default instead of returning nothing.
 */
function pickDefaultEnv<
  T extends { slug?: string | null; tier?: string | null; type?: string },
>(envs: T[]): T | undefined {
  return (
    envs.find((e) => e.slug === "staging") ?? // conventional staging slug
    envs.find((e) => e.tier === "STAGING") ?? // any staging-tier env
    envs.find((e) => e.type === "STAGING") ?? // legacy rows with no tier set
    envs[0] // last resort: the project's first env
  );
}

export function assertReturnEnv(env: string | undefined): ReturnEnv {
  if (!env || !VALID_ENVS.has(env)) return "staging";
  return env as ReturnEnv;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly projects: ProjectsService,
    private readonly tokenService: GithubTokenService,
    @InjectQueue("indexing") private readonly indexingQueue: Queue,
    private readonly indexingSse: IndexingSseService,
  ) {}

  getInstallUrl(payload: GithubStatePayload): string {
    const slug = env("GITHUB_APP_SLUG") ?? "heizen";
    const state = signState(payload);
    return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
  }

  /**
   * Returns the URL to the existing GitHub App installation settings page.
   * Fetches the installation to determine whether it belongs to a user or org.
   */
  async getManageUrl(installationId: string): Promise<string> {
    return getInstallationManageUrl(installationId);
  }

  async handleCallback(userId: string, projectId: string, installationId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId: project.organizationId },
    });
    if (!member) {
      throw new ForbiddenException(
        `User ${userId} is not a member of org ${project.organizationId}`,
      );
    }

    const isReinstall =
      project.githubInstallationId &&
      project.githubInstallationId !== installationId;

    return this.prisma.project.update({
      where: { id: projectId },
      data: isReinstall
        ? {
            githubInstallationId: installationId,
            githubOwner: null,
            githubRepo: null,
            githubBranch: null,
          }
        : { githubInstallationId: installationId },
    });
  }

  async getProjectSlug(projectId: string): Promise<string | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });
    return project?.slug ?? null;
  }

  async listRepos(orgId: string, projectId: string) {
    const project = await this.projects.get(orgId, projectId);
    if (!project.githubInstallationId) {
      throw new BadRequestException("GitHub App not installed for this project");
    }

    let token: string;
    try {
      token = await this.tokenService.getToken(project.githubInstallationId);
    } catch (err) {
      this.logger.error(`Failed to get installation token: ${err instanceof Error ? err.message : err}`);
      // Installation likely revoked — clear it and tell the caller to reinstall
      await this.clearInstallation(projectId);
      throw new ConflictException(
        "GitHub App installation not found or revoked. Please reconnect.",
      );
    }

    const repositories: Array<{
      full_name: string;
      name: string;
      owner: { login: string };
      default_branch: string;
    }> = [];

    let url: string | null =
      "https://api.github.com/installation/repositories?per_page=100&page=1";

    let pageCount = 0;
    const PAGE_LIMIT = 100; // safety cap at 10,000 repos

    while (url && pageCount < PAGE_LIMIT) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (res.status === 401 || res.status === 403) {
        this.logger.warn(
          `GitHub installation ${project.githubInstallationId} returned ${res.status} — clearing stale install`,
        );
        await this.clearInstallation(projectId);
        throw new ConflictException(
          "GitHub App installation revoked. Please reconnect.",
        );
      }

      if (res.status >= 500) {
        throw new ServiceUnavailableException("GitHub API is currently unavailable");
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new BadRequestException(
          `Failed to list repositories (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
        );
      }

      const data = (await res.json()) as {
        repositories: Array<{
          full_name: string;
          name: string;
          owner: { login: string };
          default_branch: string;
        }>;
      };

      repositories.push(...data.repositories);
      url = getNextGitHubPageUrl(res.headers.get("link"));
      pageCount++;
    }

    return repositories
      .map((r) => ({
        fullName: r.full_name,
        name: r.name,
        owner: r.owner.login,
        defaultBranch: r.default_branch,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async connect(
    orgId: string,
    projectId: string,
    owner: string,
    repo: string,
    branch: string,
    environmentId: string,
    installationId?: string,
  ) {
    const project = await this.projects.get(orgId, projectId);

    const targetInstallationId = installationId ?? project.githubInstallationId;
    if (!targetInstallationId) {
      throw new ConflictException(
        "GitHub App not installed. Please install the app before connecting a repository.",
      );
    }

    if (installationId && project.githubInstallationId !== installationId) {
      const conn = await this.prisma.githubConnection.findFirst({
        where: { installationId },
        select: { id: true },
      });
      if (!conn) {
        throw new ForbiddenException("Unknown GitHub installation");
      }
    }

    // Verify the selected repo is accessible BEFORE persisting the rebind, so a
    // failed access check can't leave the project pointing at a connection that
    // doesn't actually grant access to the requested repo.
    const token = await this.tokenService.getToken(targetInstallationId);
    const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (checkRes.status === 404 || checkRes.status === 403) {
      throw new BadRequestException(
        `Repository "${owner}/${repo}" is not accessible to the GitHub App installation. ` +
        `Please update app permissions to include this repository.`,
      );
    }

    if (!checkRes.ok) {
      throw new BadRequestException(
        `Could not verify repository access (HTTP ${checkRes.status})`,
      );
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        githubOwner: owner,
        githubRepo: repo,
        githubBranch: branch,
        ...(installationId && project.githubInstallationId !== installationId
          ? { githubInstallationId: installationId }
          : {}),
      },
    });

    await this.triggerIndex(projectId, environmentId);
    return { ok: true };
  }

  async triggerIndex(projectId: string, environmentId?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });

    if (!project?.githubInstallationId) {
      throw new ConflictException(
        "GitHub App is not installed for this project. Please install the app first.",
      );
    }

    if (!project.githubOwner || !project.githubRepo) {
      throw new BadRequestException(
        "No repository connected. Please connect a repository before indexing.",
      );
    }

    const env =
      project.environments.find((e) => e.id === environmentId) ??
      pickDefaultEnv(project.environments);

    if (!env) throw new NotFoundException("Environment not found");

    const jobId = `index:${projectId}:${env.id}`;
    const existing = await this.indexingQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "active" || state === "waiting" || state === "delayed" || state === "waiting-children") {
        return { queued: false, alreadyRunning: true, environmentId: env.id };
      }
      await existing.remove();
    }

    await this.indexingQueue.add(
      "index",
      {
        projectId,
        owner: project.githubOwner,
        repo: project.githubRepo,
        branch: project.githubBranch ?? "main",
        installationId: project.githubInstallationId,
        environmentId: env.id,
      },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return { queued: true, environmentId: env.id };
  }

  async getIndexResult(orgId: string, projectId: string) {
    const project = await this.projects.get(orgId, projectId);
    const env = pickDefaultEnv(project.environments);
    if (!env) throw new NotFoundException("Environment not found");
    return { heizenConfig: env.heizenConfig, environmentId: env.id };
  }

  /** Clear a stale / revoked GitHub installation from a project. */
  private async clearInstallation(projectId: string): Promise<void> {
    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { githubInstallationId: null },
      });
    } catch (err) {
      this.logger.error(`Failed to clear installation for project ${projectId}`, err);
    }
  }
}

function getNextGitHubPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}
