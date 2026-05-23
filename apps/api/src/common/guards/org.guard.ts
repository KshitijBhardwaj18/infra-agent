import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../../prisma/prisma.module";

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException("Not authenticated");

    const activeOrgId = request.session?.activeOrganizationId;

    if (activeOrgId) {
      const member = await this.prisma.member.findFirst({
        where: { userId, organizationId: activeOrgId },
      });
      if (!member) throw new ForbiddenException("Not a member of this organization");
      request.organizationId = activeOrgId;
      return true;
    }

    const member = await this.prisma.member.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (!member) throw new ForbiddenException("No organization found");

    request.organizationId = member.organizationId;
    return true;
  }
}
