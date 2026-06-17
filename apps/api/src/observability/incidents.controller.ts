import {
  Body,
  Controller,
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
import { IncidentsService } from "./incidents.service";
import { ObservabilityService } from "./observability.service";
import { IncidentAnalysisService } from "./incident-analysis.service";

@Controller("api/projects/:projectId/environments/:envId/incidents")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly observability: ObservabilityService,
    private readonly analysis: IncidentAnalysisService,
  ) {}

  // Reading incidents is open to any project member.
  @Get()
  list(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.incidents.list(orgId, projectId, envId);
  }

  // A scan probes the live env + calls the LLM, so gate it to operators.
  @Post("scan")
  @RequireProjectRole("OWNER", "DEPLOYER")
  scan(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.observability.scan(orgId, projectId, envId);
  }

  @Post()
  @RequireProjectRole("OWNER", "DEPLOYER")
  create(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Body()
    body: {
      severity: "CRITICAL" | "WARNING" | "INFO";
      title: string;
      detail?: string;
    },
  ) {
    return this.incidents.createManual(orgId, projectId, envId, {
      severity: body.severity,
      source: "MANUAL",
      title: body.title,
      detail: body.detail,
    });
  }

  // Deep root-cause analysis — gathers deploy timeline + live container
  // state and runs the intelligence layer. LLM cost, so operator-gated.
  @Post(":incidentId/analyze")
  @RequireProjectRole("OWNER", "DEPLOYER")
  analyze(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("incidentId") incidentId: string,
  ) {
    return this.analysis.analyze(orgId, projectId, envId, incidentId);
  }

  @Patch(":incidentId")
  @RequireProjectRole("OWNER", "DEPLOYER")
  updateStatus(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: { status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" },
  ) {
    return this.incidents.updateStatus(
      orgId,
      projectId,
      envId,
      incidentId,
      body.status,
    );
  }
}
