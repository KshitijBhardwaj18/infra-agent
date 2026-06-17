import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../../prisma/prisma.module";
import { PROJECT_ROLES_KEY, ProjectRoleName } from "./decorators";

@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ProjectRoleName[]>(
      PROJECT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException("Not authenticated");

    const projectId = await this.resolveProjectId(request);
    if (!projectId) throw new BadRequestException("Project context required");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systemRole: true },
    });
    if (user?.systemRole === "ADMIN") {
      request.projectId = projectId;
      return true;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!member) throw new ForbiddenException("Not a member of this project");

    if (!required.includes(member.role as ProjectRoleName)) {
      throw new ForbiddenException(
        `Required project role: ${required.join(" or ")}`,
      );
    }

    request.projectId = projectId;
    request.projectMember = member;
    return true;
  }

  private async resolveProjectId(request: any): Promise<string | null> {
    const params = request.params ?? {};
    // Common forms across our controllers:
    //   /api/projects/:id            (ProjectsController) — `id`
    //   /api/projects/:projectId/... (Environments/Deployments/etc) — `projectId`
    //   /projects/:projectSlug/...   — `projectSlug` resolved via org scope
    if (params.projectId) return params.projectId;
    if (params.id) return params.id;
    if (params.projectSlug) {
      const organizationId = request.organizationId;
      if (!organizationId) return null;
      const proj = await this.prisma.project.findFirst({
        where: { organizationId, slug: params.projectSlug },
        select: { id: true },
      });
      return proj?.id ?? null;
    }
    const header = request.headers?.["x-project-id"];
    if (typeof header === "string" && header.length > 0) {
      const organizationId = request.organizationId;
      if (!organizationId) return null;
      const proj = await this.prisma.project.findUnique({
        where: { id: header },
        select: { id: true, organizationId: true },
      });
      if (proj && proj.organizationId === organizationId) return proj.id;
    }
    return null;
  }
}
