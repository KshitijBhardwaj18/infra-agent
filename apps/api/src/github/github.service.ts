import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { ProjectsService } from "../projects/projects.service";
import { GithubTokenService } from "./github-token.service";
import { IndexingSseService } from "./indexing-sse.service";

@Injectable()
export class GithubService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly projects: ProjectsService,
    private readonly tokenService: GithubTokenService,
    @InjectQueue("indexing") private readonly indexingQueue: Queue,
    private readonly indexingSse: IndexingSseService,
  ) {}

  getInstallUrl(projectId: string, returnEnv = "staging"): string {
    const slug = process.env.GITHUB_APP_SLUG ?? "heizen";
    const state = Buffer.from(JSON.stringify({ projectId, returnEnv })).toString("base64");
    return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
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

    return this.prisma.project.update({
      where: { id: projectId },
      data: { githubInstallationId: installationId },
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
      throw new BadRequestException("GitHub App not installed");
    }

    const token = await this.tokenService.getToken(project.githubInstallationId);
    const repositories: Array<{
      full_name: string;
      name: string;
      owner: { login: string };
      default_branch: string;
    }> = [];

    let url: string | null =
      "https://api.github.com/installation/repositories?per_page=100&page=1";

    while (url) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!res.ok) throw new BadRequestException("Failed to list repositories");

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
  ) {
    const project = await this.projects.get(orgId, projectId);
    if (!project.githubInstallationId) {
      throw new BadRequestException("GitHub App not installed");
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { githubOwner: owner, githubRepo: repo, githubBranch: branch },
    });

    await this.triggerIndex(projectId, environmentId);
    return { ok: true };
  }

  async triggerIndex(projectId: string, environmentId?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: true },
    });
    if (!project?.githubOwner || !project.githubRepo || !project.githubInstallationId) {
      throw new BadRequestException("Project not connected to GitHub");
    }

    const env =
      project.environments.find((e) => e.id === environmentId) ??
      project.environments.find((e) => e.type === "STAGING");

    if (!env) throw new NotFoundException("Environment not found");

    await this.indexingQueue.add("index", {
      projectId,
      owner: project.githubOwner,
      repo: project.githubRepo,
      branch: project.githubBranch ?? "main",
      installationId: project.githubInstallationId,
      environmentId: env.id,
    });

    return { queued: true, environmentId: env.id };
  }

  async getIndexResult(orgId: string, projectId: string) {
    const project = await this.projects.get(orgId, projectId);
    const env = project.environments.find((e) => e.type === "STAGING");
    if (!env) throw new NotFoundException("Environment not found");
    return { heizenConfig: env.heizenConfig, environmentId: env.id };
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
