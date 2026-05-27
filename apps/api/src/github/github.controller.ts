import {
  BadRequestException,
  Body,
  Controller,
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
import { CurrentOrg } from "../common/decorators/current-org";
import { CurrentUser } from "../common/decorators/current-user";
import { auth } from "../auth/auth.config";
import { GithubService, assertReturnEnv } from "./github.service";
import { IndexingSseService } from "./indexing-sse.service";
import { verifyState } from "./state";
import { getErrorMessage } from "../common/errors";
import type { IndexingSsePayload } from "@heizen/shared";

@Controller("api")
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly github: GithubService,
    private readonly indexingSse: IndexingSseService,
  ) {}

  /**
   * Initiates GitHub App installation.
   * Validates org membership before redirecting so no orphaned installs happen
   * from users who don't own the project.
   */
  @Get("github/install")
  @UseGuards(AuthGuard)
  async install(
    @Res() res: Response,
    @Query("projectId") projectId: string,
    @Query("return_env") returnEnv: string,
    @CurrentUser() user: { id: string },
  ) {
    const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

    if (!projectId) {
      return res.redirect(`${origin}/dashboard?error=github_missing_project`);
    }

    // Authz check: ensure the calling user is a member of the project's org
    // before we redirect to GitHub (prevents orphaned installs on foreign orgs).
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
    const url = this.github.getInstallUrl({ projectId, returnEnv: env, userId: user.id });
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
    const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

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

  @Get("projects/:id/github/repos")
  @UseGuards(AuthGuard, OrgGuard)
  listRepos(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.github.listRepos(orgId, id);
  }

  @Get("projects/:id/github/manage-url")
  @UseGuards(AuthGuard, OrgGuard)
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

  @Post("projects/:id/github/connect")
  @UseGuards(AuthGuard, OrgGuard)
  connect(
    @CurrentOrg() orgId: string,
    @Param("id") id: string,
    @Body() body: { owner: string; repo: string; branch: string; environmentId: string },
  ) {
    return this.github.connect(orgId, id, body.owner, body.repo, body.branch, body.environmentId);
  }

  @Post("projects/:id/github/index")
  @UseGuards(AuthGuard, OrgGuard)
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
