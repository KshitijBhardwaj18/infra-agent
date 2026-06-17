import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../../prisma/prisma.module";
import { SYSTEM_ROLES_KEY, SystemRoleName } from "./decorators";

@Injectable()
export class SystemRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SystemRoleName[]>(
      SYSTEM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException("Not authenticated");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systemRole: true },
    });
    if (!user) throw new ForbiddenException("User not found");

    if (!required.includes(user.systemRole as SystemRoleName)) {
      throw new ForbiddenException(
        `Required system role: ${required.join(" or ")}`,
      );
    }

    request.systemRole = user.systemRole;
    return true;
  }
}
