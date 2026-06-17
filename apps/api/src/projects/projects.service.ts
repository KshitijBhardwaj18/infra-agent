import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@heizen/db";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(
    orgId: string,
    creatorUserId: string,
    body: {
      name: string;
      slug: string;
      githubInstallationId?: string;
      githubOwner?: string;
      githubRepo?: string;
      githubBranch?: string;
    },
  ) {
    const trimmedName = body.name?.trim();
    if (!trimmedName) {
      throw new BadRequestException("Project name is required");
    }
    if (!body.slug || !/^[a-z0-9-]{2,40}$/.test(body.slug)) {
      throw new BadRequestException(
        "Slug must be 2-40 characters, lowercase letters, numbers, and hyphens only",
      );
    }

    const hasGithub =
      body.githubInstallationId &&
      body.githubOwner &&
      body.githubRepo &&
      body.githubBranch;

    if (body.githubInstallationId && !hasGithub) {
      throw new BadRequestException(
        "When providing a GitHub installation, owner, repo, and branch are all required",
      );
    }

    if (hasGithub) {
      const conn = await this.prisma.githubConnection.findFirst({
        where: { installationId: body.githubInstallationId },
        select: { id: true },
      });
      if (!conn) {
        throw new BadRequestException("Unknown GitHub installation");
      }
    }

    try {
      // Wrap project + ownership creation in a transaction so we never
      // end up with a project that has no members (would lock everyone
      // out except system admins).
      const project = await this.prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            organizationId: orgId,
            name: trimmedName,
            slug: body.slug,
            ...(hasGithub
              ? {
                  githubInstallationId: body.githubInstallationId,
                  githubOwner: body.githubOwner,
                  githubRepo: body.githubRepo,
                  githubBranch: body.githubBranch,
                }
              : {}),
            environments: {
              create: [
                { type: "STAGING", name: "Staging", slug: "staging", tier: "STAGING" },
                {
                  type: "PRODUCTION",
                  name: "Production",
                  slug: "production",
                  tier: "PRODUCTION",
                },
              ],
            },
          },
          include: { environments: true },
        });

        // Creator becomes the OWNER. Admins can change/add owners later
        // via the admin panel's project-members sheet.
        await tx.projectMember.create({
          data: {
            userId: creatorUserId,
            projectId: created.id,
            role: "OWNER",
          },
        });

        return created;
      });
      return project;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("Project slug already exists in this organization");
      }
      this.logger.error("Failed to create project", err);
      throw err;
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
            region: true,
            lastDeployedAt: true,
            heizenConfig: true,
            composeServicesCache: true,
            stackOutputs: true,
            // Needed by the env page to render the correct strategy badge
            // + endpoints card (EC2 vs ECS vs Lightsail). Without these the
            // page falls back to inferring "ECS" for any production env.
            deployStrategy: true,
            ec2InstanceType: true,
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
