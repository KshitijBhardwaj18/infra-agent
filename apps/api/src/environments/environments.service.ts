import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { ProjectsService } from "../projects/projects.service";
import { assumeCustomerRole } from "@heizen/infra-core";

@Injectable()
export class EnvironmentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly projects: ProjectsService,
  ) {}

  async create(orgId: string, projectId: string, type: "STAGING" | "PRODUCTION") {
    await this.projects.get(orgId, projectId);
    return this.prisma.environment.create({
      data: { projectId, type },
    });
  }

  async list(orgId: string, projectId: string) {
    await this.projects.get(orgId, projectId);
    return this.prisma.environment.findMany({ where: { projectId } });
  }

  async get(orgId: string, projectId: string, envId: string) {
    await this.projects.get(orgId, projectId);
    const env = await this.prisma.environment.findFirst({
      where: { id: envId, projectId },
    });
    if (!env) throw new NotFoundException("Environment not found");
    return env;
  }

  async update(
    orgId: string,
    projectId: string,
    envId: string,
    data: {
      awsAccountId?: string;
      awsRoleArn?: string;
      region?: string;
      domain?: string;
      heizenConfig?: unknown;
      imageUri?: string;
    },
  ) {
    await this.get(orgId, projectId, envId);
    return this.prisma.environment.update({
      where: { id: envId },
      data: data as Record<string, unknown>,
    });
  }

  async verifyAws(orgId: string, projectId: string, envId: string) {
    const env = await this.get(orgId, projectId, envId);
    if (!env.awsRoleArn || !env.region) {
      throw new NotFoundException("AWS role ARN and region must be configured");
    }

    await assumeCustomerRole(env.awsRoleArn, envId, env.region);
    return { ok: true, message: "Successfully assumed role" };
  }
}
