import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  Sse,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { map, type Observable } from "rxjs";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { ProjectRoleGuard, RequireProjectRole } from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { CurrentUser } from "../common/decorators/current-user";
import { auth } from "../auth/auth.config";
import { GithubService, assertReturnEnv } from "./github.service";
import { GithubConnectionsService } from "./github-connections.service";
import { IndexingSseService } from "./indexing-sse.service";
import { verifyState } from "./state";
import { getErrorMessage } from "../common/errors";
import { env as envVar } from "../common/env";

// CORS_ORIGIN is now a comma-separated list. For redirect URLs we need a
// single origin string — pick the first entry, falling back to localhost.
function firstWebOrigin(): string {
  const raw = envVar("CORS_ORIGIN");
  if (!raw) return "http://localhost:3000";
  const first = raw.split(",").map((s) => s.trim()).filter(Boolean)[0];
  return first ?? "http://localhost:3000";
}

function adminOrigin(): string {
  return envVar("ADMIN_ORIGIN") ?? "http://localhost:3002";
}
import type { IndexingSsePayload } from "@heizen/shared";

@Controller("api")
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly github: GithubService,
    private readonly connections: GithubConnectionsService,
    private readonly indexingSse: IndexingSseService,
  ) {}

  /**
   * Initiates GitHub App installation. Validates admin role and org membership
   * before redirecting to GitHub.
   */
  @Get("github/install")
  @UseGuards(AuthGuard)
  async install(
    @Res() res: Response,
    @Query("projectId") projectId: string,
    @Query("return_env") returnEnv: string,
    @CurrentUser() user: { id: string },
  ) {
    const origin = firstWebOrigin();

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { systemRole: true },
    });
    if (dbUser?.systemRole !== "ADMIN") {
      return res.redirect(`${origin}/dashboard?error=github_install_admin_only`);
    }

    if (!projectId) {
      return res.redirect(`${origin}/dashboard?error=github_missing_project`);
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) {
      return res.redirect(`${origin}/dashboard?error=github_project_not_found`);
    }

    const member = await this.prisma.member.findFirst({
      where: { userId: user.id, organizationId: project.organizationId },
    });
    if (!member) {
      return res.redirect(`${origin}/dashboard?error=github_forbidden`);
    }

    const env = assertReturnEnv(returnEnv);
    const url = this.github.getInstallUrl({ kind: "project", projectId, returnEnv: env, userId: user.id });
    return res.redirect(url);
  }

  /**
   * Canonical GitHub OAuth callback — GitHub redirects here after install.
   * Verifies the signed state, completes the installation, and redirects to
   * the project page. This is the only post-install path; no cookies needed.
   *
   * No AuthGuard here — we do a manual session check so we can redirect to
   * /login instead of returning a 401 JSON response in the browser.
   */
  @Get("github/callback")
  async callback(
    @Query("installation_id") installationId: string,
    @Query("state") stateParam: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = firstWebOrigin();

    // Manual session check so we can redirect to /login instead of 401-ing.
    const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
    if (!session?.user) {
      const callbackUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const next = encodeURIComponent(callbackUrl);
      return res.redirect(`${origin}/login?next=${next}`);
    }
    const user = session.user;

    if (!installationId) {
      return res.redirect(`${origin}/dashboard?error=github_install_missing`);
    }

    if (!stateParam) {
      return res.redirect(`${origin}/dashboard?error=github_state_missing`);
    }

    let payload: ReturnType<typeof verifyState>;
    try {
      payload = verifyState(stateParam);
    } catch (err) {
      const message = getErrorMessage(err);
      this.logger.warn(`GitHub callback: invalid state — ${message}`);
      const encoded = encodeURIComponent(message);
      return res.redirect(`${origin}/dashboard?error=github_state_invalid&reason=${encoded}`);
    }

    // Ensure the user completing the install is the same one who started it.
    if (payload.userId !== user.id) {
      return res.redirect(`${origin}/dashboard?error=github_user_mismatch`);
    }

    switch (payload.kind) {
      case "admin-connection": {
        const adminBase = adminOrigin();
        try {
          const conn = await this.connections.register(installationId, user.id);
          return res.redirect(
            `${adminBase}/github?status=connected&account=${encodeURIComponent(conn.accountLogin)}`,
          );
        } catch (err) {
          if (
            err &&
            typeof err === "object" &&
            "status" in err &&
            (err as { status: number }).status === 409
          ) {
            return res.redirect(`${adminBase}/github?error=already_connected`);
          }
          this.logger.error(
            `Admin GitHub connection failed: ${getErrorMessage(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
          return res.redirect(`${adminBase}/github?error=install_failed`);
        }
      }
      case "project": {
        const { projectId, returnEnv } = payload;
        try {
          const project = await this.github.handleCallback(user.id, projectId, installationId);
          return res.redirect(`${origin}/projects/${project.slug}/${returnEnv}`);
        } catch (err) {
          const message = getErrorMessage(err);
          this.logger.error(
            `GitHub callback failed: ${message}`,
            err instanceof Error ? err.stack : undefined,
          );
          const reason = encodeURIComponent(message);
          const slug = await this.github.getProjectSlug(projectId);
          const base = slug
            ? `${origin}/projects/${slug}/${returnEnv}`
            : `${origin}/dashboard`;
          return res.redirect(`${base}?error=github_install_failed&reason=${reason}`);
        }
      }
      default: {
        const _exhaustive: never = payload;
        this.logger.error(`Unknown GitHub state kind: ${JSON.stringify(_exhaustive)}`);
        return res.redirect(`${origin}/dashboard?error=github_state_invalid`);
      }
    }
  }

  @Get("github/repos")
  @UseGuards(AuthGuard)
  async allRepos() {
    return this.connections.listAllRepos();
  }

  @Get("github/repos/:owner/:repo/branches")
  @UseGuards(AuthGuard)
  async repoBranches(
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Query("installationId") installationId: string,
  ) {
    if (!installationId) {
      throw new BadRequestException("installationId query param is required");
    }
    // Gate to installations registered against this Heizen instance.
    // GitHub connections are org-level (single-org model today), so any
    // authenticated user may read branches for any registered connection.
    // The existence check is what prevents enumeration of unregistered
    // installation IDs to probe foreign GitHub Apps' repos.
    const known = await this.prisma.githubConnection.findUnique({
      where: { installationId },
      select: { installationId: true },
    });
    if (!known) {
      throw new ForbiddenException(
        "Installation is not registered with this Heizen instance.",
      );
    }
    return this.connections.listBranches(installationId, owner, repo);
  }

  @Get("projects/:id/github/repos")
  @UseGuards(AuthGuard, OrgGuard)
  listRepos(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.github.listRepos(orgId, id);
  }

  // Manage URL is a deep-link to the GitHub App settings page —
  // changes there can break every project on the App. OWNER only.
  @Get("projects/:id/github/manage-url")
  @UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
  @RequireProjectRole("OWNER")
  async getManageUrl(@CurrentOrg() orgId: string, @Param("id") id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: orgId },
      select: { githubInstallationId: true },
    });
    if (!project?.githubInstallationId) {
      throw new BadRequestException("GitHub App not installed for this project");
    }
    try {
      const url = await this.github.getManageUrl(project.githubInstallationId);
      return { url };
    } catch (err) {
      this.logger.error(
        `Failed to fetch GitHub manage URL for project ${id}: ${err instanceof Error ? err.message : err}`,
      );
      throw new ServiceUnavailableException(
        "Could not fetch GitHub manage URL. The app installation may have been revoked.",
      );
    }
  }

  // Connecting a repo to an environment is a structural change — OWNER.
  @Post("projects/:id/github/connect")
  @UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
  @RequireProjectRole("OWNER")
  connect(
    @CurrentOrg() orgId: string,
    @Param("id") id: string,
    @Body() body: { owner: string; repo: string; branch: string; environmentId: string; installationId?: string },
  ) {
    return this.github.connect(orgId, id, body.owner, body.repo, body.branch, body.environmentId, body.installationId);
  }

  // Re-indexing the repo costs time + GitHub API quota; gate to
  // DEPLOYER/OWNER. Viewers can still read the cached result via the
  // GET below.
  @Post("projects/:id/github/index")
  @UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
  @RequireProjectRole("OWNER", "DEPLOYER")
  reindex(
    @Param("id") id: string,
    @Body() body: { environmentId?: string },
  ) {
    return this.github.triggerIndex(id, body.environmentId);
  }

  @Get("projects/:id/github/index")
  @UseGuards(AuthGuard, OrgGuard)
  getIndex(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.github.getIndexResult(orgId, id);
  }

  @Sse("projects/:id/github/index/stream")
  @UseGuards(AuthGuard, OrgGuard)
  indexStream(@Param("id") id: string): Observable<MessageEvent> {
    return this.indexingSse.stream(id).pipe(
      map((payload: IndexingSsePayload) => ({ data: payload }) as MessageEvent),
    );
  }
}
