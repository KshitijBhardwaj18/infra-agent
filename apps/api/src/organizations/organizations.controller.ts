import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { CurrentUser } from "../common/decorators/current-user";
import { OrganizationsService } from "./organizations.service";

@Controller("api/organizations")
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  async create(
    @CurrentUser() user: { id: string },
    @Body() body: { name: string; slug: string },
  ) {
    return this.orgs.create(user.id, body.name, body.slug);
  }

  @Get("current")
  async getCurrent(@Req() req: { user: { id: string }; session: { activeOrganizationId?: string } }) {
    return this.orgs.getCurrent(req.user.id, req.session?.activeOrganizationId);
  }

  @Patch(":id")
  @UseGuards(OrgGuard)
  async update(
    @Param("id") id: string,
    @Body() body: { name?: string; slug?: string; logo?: string },
  ) {
    return this.orgs.update(id, body);
  }

  @Get(":id/members")
  @UseGuards(OrgGuard)
  async listMembers(@Param("id") id: string) {
    return this.orgs.listMembers(id);
  }

  @Patch(":id/members/:memberId")
  @UseGuards(OrgGuard)
  async updateMember(
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body() body: { role: string },
  ) {
    return this.orgs.updateMember(id, memberId, body.role);
  }

  @Delete(":id/members/:memberId")
  @UseGuards(OrgGuard)
  async removeMember(
    @Param("id") id: string,
    @Param("memberId") memberId: string,
  ) {
    return this.orgs.removeMember(id, memberId);
  }
}
