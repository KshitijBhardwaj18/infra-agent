import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { ProjectRoleGuard, RequireProjectRole } from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { DataSourcesService } from "./data-sources.service";

/**
 * Manage an environment's external observability connections. Reads are
 * open to any project member (they only return safe metadata, never the
 * encrypted config); writes are operator-gated.
 */
@Controller("api/projects/:projectId/environments/:envId/data-sources")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class DataSourcesController {
  constructor(private readonly dataSources: DataSourcesService) {}

  @Get()
  list(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.dataSources.list(orgId, projectId, envId);
  }

  @Post()
  @RequireProjectRole("OWNER", "DEPLOYER")
  create(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Body()
    body: {
      type: string;
      displayName: string;
      config: Record<string, unknown>;
    },
  ) {
    return this.dataSources.create(orgId, projectId, envId, body);
  }

  @Patch(":id")
  @RequireProjectRole("OWNER", "DEPLOYER")
  setEnabled(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("id") id: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.dataSources.setEnabled(
      orgId,
      projectId,
      envId,
      id,
      Boolean(body.enabled),
    );
  }

  @Delete(":id")
  @RequireProjectRole("OWNER", "DEPLOYER")
  remove(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("id") id: string,
  ) {
    return this.dataSources.remove(orgId, projectId, envId, id);
  }
}
