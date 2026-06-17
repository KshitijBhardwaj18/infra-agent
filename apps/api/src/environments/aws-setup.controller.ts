import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  Inject,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { Response } from "express";
import type { PrismaClient } from "@heizen/db";
import { readDeployRoleTemplate } from "@heizen/infra-core";
import { PRISMA } from "../prisma/prisma.module";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { env } from "../common/env";

// Project / environment ids are CUIDs (project ids may also be slugs) —
// safe-character ids only. Guards the values interpolated into the
// (unencoded) templateUrl path built in `info` below.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

@Controller("api/projects/:projectId/environments/:envId/aws-setup")
export class AwsSetupController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Returns the raw CloudFormation YAML for the Heizen deploy role.
   *
   * Intentionally PUBLIC (no auth guard): the AWS console fetches this URL
   * server-side to prefill the stack when the customer opens the quick-create
   * link, so auth-gating it would break the one-click flow. Safe to expose —
   * the template is a generic, non-sensitive IAM role definition with no
   * per-tenant data; the env-specific ExternalId is passed as a URL parameter
   * (see `info` below), never embedded in the template. The `info` route that
   * hands out the launch link IS auth-gated.
   */
  @Get("template.yml")
  async template(@Res() res: Response) {
    const yaml = await readDeployRoleTemplate();
    res.setHeader("Content-Type", "application/x-yaml");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="heizen-deploy-role.yml"',
    );
    res.send(yaml);
  }

  /**
   * Returns the data the env-settings UI needs to render the "Launch Stack"
   * affordance: the platform AWS account ID (to fill the trust policy), the
   * external-id (the env id), a region-default, and a pre-built console URL.
   */
  @Get("info")
  @UseGuards(AuthGuard, OrgGuard)
  async info(
    @Param("projectId") projectId: string,
    @Param("envId") envId: string,
  ) {
    if (!SAFE_ID.test(projectId) || !SAFE_ID.test(envId)) {
      throw new BadRequestException("Invalid project or environment id.");
    }

    const environment = await this.prisma.environment.findFirst({
      where: { id: envId, projectId },
      select: { id: true, region: true },
    });
    if (!environment) throw new NotFoundException("Environment not found");

    const heizenAccountId = env("PLATFORM_AWS_ACCOUNT_ID");
    if (!heizenAccountId) {
      throw new BadRequestException(
        "Platform AWS account ID not configured. An admin must set PLATFORM_AWS_ACCOUNT_ID.",
      );
    }

    const apiBase =
      env("API_PUBLIC_URL") ?? env("BETTER_AUTH_URL") ?? "http://localhost:3001";
    const templateUrl = `${apiBase}/api/projects/${projectId}/environments/${envId}/aws-setup/template.yml`;
    const region = environment.region ?? "us-east-1";

    // CloudFormation quick-create-stack URL. Opens the AWS console with
    // template + parameters pre-filled; customer just reviews and clicks
    // "Create stack". Requires the templateUrl to be publicly reachable
    // by AWS — in local dev this won't work because localhost isn't
    // reachable from the AWS console; surface a hint in the UI for that.
    const params = new URLSearchParams({
      templateURL: templateUrl,
      stackName: "heizen-deploy-role",
      param_HeizenAccountId: heizenAccountId,
      param_ExternalId: environment.id,
      param_RoleName: "HeizenDeployRole",
    });
    const launchUrl = `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?${params.toString()}`;

    return {
      heizenAccountId,
      externalId: environment.id,
      region,
      templateUrl,
      launchUrl,
      // Hint for dev: localhost URLs aren't reachable from the AWS console.
      // The UI should warn when templateUrl looks like a localhost address.
      localhostTemplate: /^https?:\/\/(localhost|127\.0\.0\.1)/.test(templateUrl),
    };
  }
}
