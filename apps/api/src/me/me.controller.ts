import {
  Controller,
  Get,
  Req,
  UseGuards,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { AuthGuard } from "../common/guards/auth.guard";

@Controller("api/me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async me(@Req() req: Request & { user: { id: string } }) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        systemRole: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");

    const projectMemberships = await this.prisma.projectMember.findMany({
      where: { userId: user.id },
      select: {
        projectId: true,
        role: true,
        project: { select: { slug: true, name: true } },
      },
    });

    return {
      ...user,
      projectMemberships: projectMemberships.map((m) => ({
        projectId: m.projectId,
        role: m.role,
        slug: m.project.slug,
        name: m.project.name,
      })),
    };
  }
}
