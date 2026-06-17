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
import {
  ProjectRoleGuard,
  RequireProjectRole,
} from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import type { DeployStrategy } from "@heizen/shared";
import { EnvironmentsService } from "./environments.service";

@Controller("api/projects/:projectId/environments")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  // Add a custom environment (beyond the auto-scaffolded STAGING +
  // PRODUCTION) with its own name, slug, template, and tier — OWNER only.
  @Post()
  @RequireProjectRole("OWNER")
  create(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      name: string;
      slug?: string;
      deployStrategy: DeployStrategy;
      tier?: "STAGING" | "PRODUCTION";
    },
  ) {
    return this.environments.create(orgId, projectId, body);
  }

  // Delete a custom environment — OWNER only. Staging/production can't be
  // removed, and the env must have no live stack.
  @Delete(":envId")
  @RequireProjectRole("OWNER")
  remove(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.environments.remove(orgId, projectId, envId);
  }

  @Get()
  list(@CurrentOrg() orgId: string, @Param("projectId") projectId: string) {
    return this.environments.list(orgId, projectId);
  }

  @Get(":envId")
  get(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.environments.get(orgId, projectId, envId);
  }

  // Editing env wiring (AWS role, region, image URI, heizenConfig) —
  // OWNER only. AWS credentials are the kind of thing only the project
  // OWNER should ever touch.
  @Patch(":envId")
  @RequireProjectRole("OWNER")
  update(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
    @Body()
    body: {
      awsAccountId?: string;
      awsRoleArn?: string;
      region?: string;
      domain?: string;
      heizenConfig?: unknown;
      imageUri?: string;
      deployStrategy?: DeployStrategy;
      ec2InstanceType?: string;
    },
  ) {
    return this.environments.update(orgId, projectId, envId, body);
  }

  // AWS connectivity check — OWNER only (uses the role ARN from the
  // env config, surfaces sts:AssumeRole errors back to the caller).
  @Post(":envId/aws/verify")
  @RequireProjectRole("OWNER")
  verifyAws(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.environments.verifyAws(orgId, projectId, envId);
  }

  // ECR images in the customer account — populates the deploy form's
  // per-service image dropdowns. Read-only; same role as deploying.
  @Get(":envId/ecr/images")
  @RequireProjectRole("OWNER", "DEPLOYER")
  listEcrImages(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.environments.listEcrImages(orgId, projectId, envId);
  }
}
