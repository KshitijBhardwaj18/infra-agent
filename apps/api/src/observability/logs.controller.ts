import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { ProjectRoleGuard, RequireProjectRole } from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { LogsService } from "./logs.service";
import { LogAnalysisService } from "./log-analysis.service";

@Controller("api/projects/:projectId/environments/:envId/logs")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class LogsController {
  constructor(
    private readonly logs: LogsService,
    private readonly analysis: LogAnalysisService,
  ) {}

  // Reading app logs is open to any project member (same visibility as
  // deployment logs and incidents).
  @Get()
  fetch(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Query("service") service?: string,
    @Query("minutes") minutes?: string,
    @Query("limit") limit?: string,
  ) {
    return this.logs.fetch(orgId, projectId, envId, {
      service: service || undefined,
      minutes: minutes ? Number(minutes) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // LLM cost — operator-gated like incident analysis.
  @Post("analyze")
  @RequireProjectRole("OWNER", "DEPLOYER")
  analyze(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Body()
    body: { service?: string; minutes?: number; question?: string },
  ) {
    return this.analysis.analyze(orgId, projectId, envId, {
      service: body.service,
      minutes: body.minutes,
      question: body.question,
    });
  }
}
