import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { EnvironmentsService } from "../environments/environments.service";

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly environments: EnvironmentsService,
  ) {}

  async list(orgId: string, projectId: string, envId: string) {
    await this.environments.get(orgId, projectId, envId);
    return this.prisma.stackResource.findMany({
      where: { environmentId: envId },
      orderBy: { type: "asc" },
    });
  }
}
