import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class OrganizationsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(userId: string, name: string, slug: string) {
    const org = await this.prisma.organization.create({
      data: {
        id: crypto.randomUUID(),
        name,
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
