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
    const orgId = request.session?.activeOrganizationId;

    if (!userId || !orgId) {
      throw new ForbiddenException("No active organization");
    }

    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId: orgId },
    });

    if (!member) {
      throw new ForbiddenException("Not a member of this organization");
    }

    request.organizationId = orgId;
    request.member = member;
    return true;
  }
}
