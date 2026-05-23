import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { CurrentOrg } from "../common/decorators/current-org";
import { ResourcesService } from "./resources.service";

@Controller("api/projects/:projectId/environments/:envId/resources")
@UseGuards(AuthGuard, OrgGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  list(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.resources.list(orgId, projectId, envId);
  }
}
