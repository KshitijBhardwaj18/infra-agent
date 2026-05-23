import {
  Body,
  Controller,
  Get,
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
import { GithubService } from "./github.service";
import { IndexingSseService } from "./indexing-sse.service";
import type { IndexingSsePayload } from "@heizen/shared";

@Controller("api")
export class GithubController {
  constructor(
    private readonly github: GithubService,
    private readonly indexingSse: IndexingSseService,
  ) {}

  @Get("github/install")
  @UseGuards(AuthGuard)
  install(@Res() res: Response, @Query("projectId") projectId: string) {
    return res.redirect(this.github.getInstallUrl(projectId ?? ""));
  }

  @Get("github/callback")
  @UseGuards(AuthGuard, OrgGuard)
  async callback(
    @Query("installation_id") installationId: string,
    @Query("state") stateParam: string,
    @CurrentOrg() orgId: string,
    @Res() res: Response,
  ) {
    const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

    let projectId: string;
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, "base64").toString()) as {
        projectId: string;
      };
      projectId = decoded.projectId;
    } catch {
      return res.redirect(`${origin}/dashboard?error=github_state_invalid`);
    }

    const project = await this.github.handleCallback(projectId, installationId, orgId);
    return res.redirect(`${origin}/projects/${project.slug}`);
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
