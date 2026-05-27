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
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(userId: string, name: string, slug: string) {
    const trimmedName = name?.trim();
    if (!trimmedName) {
      throw new BadRequestException("Organization name is required");
    }
    if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) {
      throw new BadRequestException(
        "Slug must be 2-40 characters, lowercase letters, numbers, and hyphens only",
      );
    }

    try {
      const org = await this.prisma.organization.create({
        data: {
          id: crypto.randomUUID(),
          name: trimmedName,
          slug,
          createdAt: new Date(),
          members: {
            create: {
              id: crypto.randomUUID(),
              userId,
              role: "owner",
              createdAt: new Date(),
            },
          },
        },
        include: { members: true },
      });
      return org;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          `Organization slug "${slug}" is already taken`,
        );
      }
      this.logger.error("Failed to create organization", err);
      throw err;
    }
  }

  async getCurrent(userId: string, activeOrganizationId?: string | null) {
    if (activeOrganizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: activeOrganizationId },
        include: { members: { where: { userId } } },
      });
      if (org && org.members.length > 0) return org;
    }

    const member = await this.prisma.member.findFirst({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    if (!member) throw new NotFoundException("No organization found");
    return member.organization;
  }

  async update(id: string, data: { name?: string; slug?: string; logo?: string }) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  async listMembers(orgId: string) {
    return this.prisma.member.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
  }

  async updateMember(orgId: string, memberId: string, role: string) {
    return this.prisma.member.update({
      where: { id: memberId, organizationId: orgId },
      data: { role },
    });
  }

  async removeMember(orgId: string, memberId: string) {
    return this.prisma.member.delete({
      where: { id: memberId, organizationId: orgId },
    });
  }
}
