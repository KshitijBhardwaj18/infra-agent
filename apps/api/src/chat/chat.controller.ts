import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { ProjectRoleGuard } from "../common/rbac";
import { CurrentOrg } from "../common/decorators/current-org";
import { CurrentUser } from "../common/decorators/current-user";
import type { ChatTurn } from "@heizen/shared";
import { ChatService } from "./chat.service";

@Controller("api/projects/:projectId/agent")
@UseGuards(AuthGuard, OrgGuard, ProjectRoleGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // Any project member can chat. The agent's capabilities are scoped to
  // the caller's project role inside ChatService: act/propose tools only
  // exist for OWNER/DEPLOYER, and proposals are only ever EXECUTED by
  // the human via the RBAC-gated deploy/destroy/ops endpoints.
  @Post("chat")
  send(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: { id: string },
    @Param("projectId") projectId: string,
    @Body() body: { message: string; history?: ChatTurn[] },
  ) {
    return this.chat.chat(
      orgId,
      projectId,
      user.id,
      body.message ?? "",
      body.history ?? [],
    );
  }
}
