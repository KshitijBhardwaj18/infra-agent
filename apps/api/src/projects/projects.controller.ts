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
import { CurrentOrg } from "../common/decorators/current-org";
import { ProjectsService } from "./projects.service";

@Controller("api/projects")
@UseGuards(AuthGuard, OrgGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(
    @CurrentOrg() orgId: string,
    @Body() body: { name: string; slug: string },
  ) {
    return this.projects.create(orgId, body.name, body.slug);
  }

  @Get()
  list(@CurrentOrg() orgId: string) {
    return this.projects.list(orgId);
  }

  @Get(":id")
  get(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.projects.get(orgId, id);
  }

  @Patch(":id")
  update(
    @CurrentOrg() orgId: string,
    @Param("id") id: string,
    @Body() body: { name?: string; slug?: string },
  ) {
    return this.projects.update(orgId, id, body);
  }

  @Delete(":id")
  remove(@CurrentOrg() orgId: string, @Param("id") id: string) {
    return this.projects.delete(orgId, id);
  }
}
