import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Param,
  Post,
  Query,
  Res,
  Sse,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { map, type Observable } from "rxjs";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { CurrentOrg } from "../common/decorators/current-org";
import { CurrentUser } from "../common/decorators/current-user";
import { GithubService } from "./github.service";
import { IndexingSseService } from "./indexing-sse.service";
import type { IndexingSsePayload } from "@heizen/shared";

function getErrorMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === "string") return response;
    if (typeof response === "object" && response && "message" in response) {
      const msg = (response as { message: string | string[] }).message;
      return Array.isArray(msg) ? msg.join(", ") : msg;
    }
  }
  if (err instanceof Error) return err.message;
  return "unknown";
}

@Controller("api")
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(
    private readonly github: GithubService,
    private readonly indexingSse: IndexingSseService,
  ) {}

  @Get("github/install")
  @UseGuards(AuthGuard)
  install(@Res() res: Response, @Query("projectId") projectId: string) {
    return res.redirect(this.github.getInstallUrl(projectId ?? ""));
  }

  @Post("github/install-complete")
  @UseGuards(AuthGuard)
  async completeInstall(
    @CurrentUser() user: { id: string },
    @Body() body: { installationId: string; state: string },
  ) {
    if (!body?.installationId) {
      throw new BadRequestException("installationId is required");
    }
    if (!body?.state) {
      throw new BadRequestException("state is required");
    }

    let projectId: string;
    try {
      const decoded = JSON.parse(Buffer.from(body.state, "base64").toString()) as {
        projectId: string;
      };
      projectId = decoded.projectId;
    } catch {
      throw new BadRequestException("Invalid state parameter");
    }

    if (!projectId) {
      throw new BadRequestException("state did not contain a projectId");
    }

    this.logger.log(`Completing GitHub install for project ${projectId} (user ${user.id})`);
    const project = await this.github.handleCallback(user.id, projectId, body.installationId);
    return { slug: project.slug, id: project.id };
  }

  @Get("github/callback")
  @UseGuards(AuthGuard)
  async callback(
    @Query("installation_id") installationId: string,
    @Query("state") stateParam: string,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

    if (!installationId) {
      return res.redirect(`${origin}/dashboard?error=github_install_missing`);
    }

    let projectId: string;
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, "base64").toString()) as {
        projectId: string;
      };
      projectId = decoded.projectId;
    } catch {
      return res.redirect(`${origin}/dashboard?error=github_state_invalid`);
    }

    try {
      const project = await this.github.handleCallback(user.id, projectId, installationId);
      return res.redirect(`${origin}/projects/${project.slug}`);
    } catch (err) {
      const message = getErrorMessage(err);
      this.logger.error(`GitHub callback failed: ${message}`, err instanceof Error ? err.stack : undefined);
      const reason = encodeURIComponent(message);
      const slug = await this.github.getProjectSlug(projectId);
      const base = slug
        ? `${origin}/projects/${slug}/staging`
        : `${origin}/dashboard`;
      return res.redirect(`${base}?error=github_install_failed&reason=${reason}`);
    }
  }

  @Get("projects/:id/github/repos")
  @UseGuards(AuthGuard, OrgGuard)
  listRepos(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.github.listRepos(orgId, id);
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
