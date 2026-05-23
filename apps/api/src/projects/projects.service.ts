import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class ProjectsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(orgId: string, name: string, slug: string) {
    try {
      const project = await this.prisma.project.create({
        data: {
          organizationId: orgId,
          name,
          slug,
          environments: {
            create: [
              { type: "STAGING" },
              { type: "PRODUCTION" },
            ],
          },
        },
        include: { environments: true },
      });
      return project;
    } catch {
      throw new ConflictException("Project slug already exists in this organization");
    }
  }

  async list(orgId: string) {
    return this.prisma.project.findMany({
      where: { organizationId: orgId },
      include: {
        environments: {
          select: {
            id: true,
            type: true,
            status: true,
            lastDeployedAt: true,
            heizenConfig: true,
            stackOutputs: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(orgId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: orgId },
      include: { environments: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async getBySlug(orgId: string, slug: string) {
    const project = await this.prisma.project.findFirst({
      where: { slug, organizationId: orgId },
      include: { environments: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async update(orgId: string, id: string, data: { name?: string; slug?: string }) {
    await this.get(orgId, id);
    return this.prisma.project.update({ where: { id }, data });
  }

  async delete(orgId: string, id: string) {
    await this.get(orgId, id);
    return this.prisma.project.delete({ where: { id } });
  }
}
