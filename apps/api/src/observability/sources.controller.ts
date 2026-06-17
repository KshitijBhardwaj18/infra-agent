import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { ProjectRoleGuard } from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { SourcesService } from "./sources.service";

/**
 * Read-only view of which observability sources feed an environment.
 * Open to any project member (no secrets — just provider names + status).
 */
@Controller("api/projects/:projectId/environments/:envId/sources")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  describe(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.sources.describe(orgId, projectId, envId);
  }
}
