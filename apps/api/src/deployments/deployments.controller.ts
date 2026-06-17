import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import {
  ProjectRoleGuard,
  RequireProjectRole,
} from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { CurrentUser } from "../common/decorators/current-user";
import { DeploymentsService } from "./deployments.service";
import { DeploymentsSseService } from "./deployments-sse.service";
import type { DeploymentLogPayload } from "@heizen/shared";

@Controller("api/projects/:projectId/environments/:envId/deployments")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class DeploymentsController {
  constructor(
    private readonly deployments: DeploymentsService,
    private readonly sse: DeploymentsSseService,
  ) {}

  // Trigger a deploy — DEPLOYER or OWNER.
  @Post()
  @RequireProjectRole("OWNER", "DEPLOYER")
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Body() body: { commitSha?: string },
  ) {
    return this.deployments.create(orgId, projectId, envId, user.id, body.commitSha);
  }

  @Get()
  list(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.deployments.list(orgId, projectId, envId);
  }

  @Get(":deployId")
  get(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("deployId") deployId: string,
  ) {
    return this.deployments.get(orgId, projectId, envId, deployId);
  }

  // Destroy is implemented as a Deployment row with kind=DESTROY. The
  // existing log stream + status websocket fan-out work without changes
  // because the worker dispatches on `deployment.kind`.
  // DEPLOYER or OWNER (destroying tears down infra — needs the same
  // permission as deploying, not just viewing).
  @Post("destroy")
  @RequireProjectRole("OWNER", "DEPLOYER")
  destroy(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.deployments.destroy(orgId, projectId, envId, user.id);
  }

  // Roll back to the previous good commit — the highest-value remediation.
  // Same permission as deploying; runs through the normal deploy path.
  @Post("rollback")
  @RequireProjectRole("OWNER", "DEPLOYER")
  rollback(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.deployments.rollback(orgId, projectId, envId, user.id);
  }

  // Cancel a queued / in-flight deploy — same permission as triggering one.
  @Post(":deployId/cancel")
  @RequireProjectRole("OWNER", "DEPLOYER")
  cancel(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("deployId") deployId: string,
  ) {
    return this.deployments.cancel(orgId, projectId, envId, deployId);
  }

  @Get(":deployId/logs")
  logs(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("deployId") deployId: string,
  ) {
    return this.deployments.getLogs(orgId, projectId, envId, deployId);
  }

  @Sse(":deployId/logs/stream")
  logStream(@Param("deployId") deployId: string): Observable<MessageEvent> {
    return this.sse.stream(deployId).pipe(
      map((payload: DeploymentLogPayload) => ({ data: payload }) as MessageEvent),
    );
  }
}
