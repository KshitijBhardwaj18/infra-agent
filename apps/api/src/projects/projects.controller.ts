import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import {
  ProjectRoleGuard,
  RequireProjectRole,
} from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { CurrentUser } from "../common/decorators/current-user";
import { ProjectsService } from "./projects.service";

@Controller("api/projects")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // Create — any org member can create a project; the creator is
  // auto-added as the OWNER by ProjectsService.create.
  @Post()
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Body() body: {
      name: string;
      slug: string;
      githubInstallationId?: string;
      githubOwner?: string;
      githubRepo?: string;
      githubBranch?: string;
    },
  ) {
    return this.projects.create(orgId, user.id, body);
  }

  // List — visible to every org member. The service filters to the
  // user's org. ProjectRoleGuard is a no-op here (no @RequireProjectRole).
  @Get()
  list(@CurrentOrg() orgId: string) {
    return this.projects.list(orgId);
  }

  @Get(":id")
  get(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.projects.get(orgId, id);
  }

  // Edit project (rename, slug change) — OWNER only.
  @Patch(":id")
  @RequireProjectRole("OWNER")
  update(
    @CurrentOrg() orgId: string,
    @Param("id") id: string,
    @Body() body: { name?: string; slug?: string },
  ) {
    return this.projects.update(orgId, id, body);
  }

  // Delete project — OWNER only.
  @Delete(":id")
  @RequireProjectRole("OWNER")
  remove(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.projects.delete(orgId, id);
  }
}
