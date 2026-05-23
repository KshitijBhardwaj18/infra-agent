import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { EnvironmentsService } from "../environments/environments.service";

@Injectable()
export class DeploymentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly environments: EnvironmentsService,
    @InjectQueue("deployment") private readonly deploymentQueue: Queue,
  ) {}

  async create(
    orgId: string,
    projectId: string,
    envId: string,
    triggeredBy: string,
    commitSha?: string,
  ) {
    const env = await this.environments.get(orgId, projectId, envId);
    if (!env.heizenConfig) {
      throw new BadRequestException("Environment must be indexed before deploying");
    }
    if (!env.awsRoleArn || !env.region) {
      throw new BadRequestException("AWS configuration required before deploying");
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { githubOwner: true, githubRepo: true, githubInstallationId: true },
    });
    if (
      !project?.githubOwner ||
      !project?.githubRepo ||
      !project?.githubInstallationId
    ) {
      throw new BadRequestException("GitHub repository not connected before deploying");
    }

    const deployment = await this.prisma.deployment.create({
      data: {
        environmentId: envId,
        triggeredBy,
        commitSha,
        status: "QUEUED",
      },
    });

    await this.prisma.environment.update({
      where: { id: envId },
      data: { status: "DEPLOYING" },
    });

    await this.deploymentQueue.add(
      "deploy",
      {
        deploymentId: deployment.id,
        environmentId: envId,
        projectId,
      },
      {
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    return deployment;
  }

  async list(orgId: string, projectId: string, envId: string) {
    await this.environments.get(orgId, projectId, envId);
    return this.prisma.deployment.findMany({
      where: { environmentId: envId },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(orgId: string, projectId: string, envId: string, deployId: string) {
    await this.environments.get(orgId, projectId, envId);
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deployId, environmentId: envId },
      include: { logs: { orderBy: { timestamp: "asc" } } },
    });
    if (!deployment) throw new NotFoundException("Deployment not found");
    return deployment;
  }

  async cancel(orgId: string, projectId: string, envId: string, deployId: string) {
    const deployment = await this.get(orgId, projectId, envId, deployId);
    if (["SUCCESS", "FAILED", "CANCELLED"].includes(deployment.status)) {
      throw new BadRequestException("Deployment already finished");
    }

    return this.prisma.deployment.update({
      where: { id: deployId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }

  async getLogs(orgId: string, projectId: string, envId: string, deployId: string) {
    await this.get(orgId, projectId, envId, deployId);
    return this.prisma.deploymentLog.findMany({
      where: { deploymentId: deployId },
      orderBy: { timestamp: "asc" },
    });
  }
}
