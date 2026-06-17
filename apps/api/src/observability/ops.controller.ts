import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { ProjectRoleGuard, RequireProjectRole } from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { EnvironmentsService } from "../environments/environments.service";
import { VmExecService } from "./vm-exec.service";

/**
 * In-place operational actions on a live environment. Same RBAC as
 * deploying — restarting a service is a state change on customer infra.
 * This is also the executor behind the chat agent's restart proposals.
 */
@Controller("api/projects/:projectId/environments/:envId/ops")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class OpsController {
  constructor(
    private readonly environments: EnvironmentsService,
    private readonly vmExec: VmExecService,
  ) {}

  @Post("restart")
  @RequireProjectRole("OWNER", "DEPLOYER")
  async restart(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Body() body: { service: string },
  ) {
    const env = await this.environments.get(orgId, projectId, envId);
    const result = await this.vmExec.restartService(env, body.service ?? "");
    return { ok: true, result };
  }
}
