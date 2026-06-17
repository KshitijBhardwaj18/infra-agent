import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import type { PrismaClient } from "@heizen/db";
import { env } from "../common/env";
import { PRISMA } from "../prisma/prisma.module";
import { AuthGuard } from "../common/guards/auth.guard";
import { SystemRoleGuard, RequireSystemRole } from "../common/rbac";
import { AuditLogService } from "../audit/audit.service";
import { auth } from "../auth/auth.config";

@Controller("api/admin/users")
@UseGuards(AuthGuard, SystemRoleGuard)
@RequireSystemRole("ADMIN")
export class AdminUsersController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        systemRole: true,
        createdAt: true,
        _count: { select: { projectMembers: true } },
      },
    });
  }

  @Post()
  async create(
    @Body() body: { email: string; name: string; password: string; systemRole?: "ADMIN" | "MEMBER" },
    @Req() req: Request & { user: { id: string } },
  ) {
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const password = body.password;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Valid email is required");
    }
    if (!name) {
      throw new BadRequestException("Name is required");
    }
    if (typeof password !== "string" || password.length < 12) {
      throw new BadRequestException("Password must be at least 12 characters");
    }
    const systemRole = body.systemRole ?? "MEMBER";
    if (systemRole !== "ADMIN" && systemRole !== "MEMBER") {
      throw new BadRequestException("systemRole must be ADMIN or MEMBER");
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(`User with email ${email} already exists`);
    }

    // Resolve the default org BEFORE signUpEmail so we can fail fast (and
    // before creating any auth state) if no org exists yet.
    const orgName = env("DEFAULT_ORG_NAME") ?? "Heizen";
    const orgSlug = env("DEFAULT_ORG_SLUG") ?? "heizen";
    const org = await this.prisma.organization.findFirst({
      where: { OR: [{ slug: orgSlug }, { name: orgName }] },
      orderBy: { createdAt: "asc" },
    });
    if (!org) {
      throw new ConflictException(
        "Default organization not bootstrapped — restart the API or check bootstrap logs.",
      );
    }

    let created: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
    try {
      created = await auth.api.signUpEmail({
        body: { email, name, password },
        asResponse: false,
      });
    } catch (err) {
      throw new ConflictException(
        err instanceof Error ? err.message : "Failed to create user",
      );
    }
    if (!created?.user) {
      throw new ConflictException("Failed to create user");
    }
    const userId = created.user.id;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Add to default org explicitly — used to live in a databaseHooks
        // user.create.after side effect, now in the same tx as the role
        // update + audit so the three writes succeed/fail together.
        await tx.member.create({
          data: {
            id: randomUUID(),
            organizationId: org.id,
            userId,
            role: "member",
            createdAt: new Date(),
          },
        });

        if (systemRole === "ADMIN") {
          await tx.user.update({
            where: { id: userId },
            data: { systemRole: "ADMIN" },
          });
        }

        await this.audit.logInTx(tx, {
          actorId: req.user.id,
          action: "USER_CREATED",
          resourceType: "USER",
          resourceId: userId,
          metadata: { email, systemRole, name },
        });
      });
    } catch (err) {
      // Compensating delete — better-auth's signUpEmail already committed, so
      // a failure here would leave an orphaned auth record. Cascade clears
      // the linked Account/Session/Member rows.
      await this.prisma.user
        .delete({ where: { id: userId } })
        .catch(() => undefined);
      throw err;
    }

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        systemRole: true,
        createdAt: true,
      },
    });
  }

  @Patch(":id")
  async updateRole(
    @Param("id") id: string,
    @Body() body: { systemRole: "ADMIN" | "MEMBER" },
    @Req() req: Request & { user: { id: string } },
  ) {
    if (body.systemRole !== "ADMIN" && body.systemRole !== "MEMBER") {
      throw new BadRequestException("systemRole must be ADMIN or MEMBER");
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (body.systemRole === "MEMBER" && user.systemRole === "ADMIN") {
      const adminCount = await this.prisma.user.count({
        where: { systemRole: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw new ConflictException("Cannot demote the last admin");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: { systemRole: body.systemRole, updatedAt: new Date() },
        select: {
          id: true,
          name: true,
          email: true,
          systemRole: true,
          createdAt: true,
        },
      });

      await this.audit.logInTx(tx, {
        actorId: req.user.id,
        action: "USER_ROLE_CHANGED",
        resourceType: "USER",
        resourceId: id,
        metadata: { from: user.systemRole, to: body.systemRole },
      });

      return result;
    });

    return updated;
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    if (id === req.user.id) {
      throw new ForbiddenException("Cannot delete your own account");
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException("User not found");

    if (target.systemRole === "ADMIN") {
      const adminCount = await this.prisma.user.count({
        where: { systemRole: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw new ConflictException("Cannot delete the last admin");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });

      await this.audit.logInTx(tx, {
        actorId: req.user.id,
        action: "USER_DELETED",
        resourceType: "USER",
        resourceId: id,
        metadata: { email: target.email },
      });
    });

    return { ok: true };
  }
}
