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
import { CurrentOrg } from "../common/decorators/current-org";
import { EnvironmentsService } from "./environments.service";

@Controller("api/projects/:projectId/environments")
@UseGuards(AuthGuard, OrgGuard)
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Post()
  create(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { type: "STAGING" | "PRODUCTION" },
  ) {
    return this.environments.create(orgId, projectId, body.type);
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

  @Patch(":envId")
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
    },
  ) {
    return this.environments.update(orgId, projectId, envId, body);
  }

  @Post(":envId/aws/verify")
  verifyAws(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    return this.environments.verifyAws(orgId, projectId, envId);
  }
}
