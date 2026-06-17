import {
  Controller,
  Get,
  Delete,
  Req,
  Res,
  Param,
  UseGuards,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../common/guards/auth.guard";
import { SystemRoleGuard, RequireSystemRole } from "../common/rbac";
import { CurrentUser } from "../common/decorators/current-user";
import { GithubConnectionsService } from "./github-connections.service";
import { signState } from "./state";
import { env } from "../common/env";

@Controller("api/admin/github/connections")
@UseGuards(AuthGuard, SystemRoleGuard)
@RequireSystemRole("ADMIN")
export class GithubConnectionsController {
  private readonly logger = new Logger(GithubConnectionsController.name);

  constructor(private readonly connections: GithubConnectionsService) {}

  @Get()
  list() {
    return this.connections.list();
  }

  @Get("install")
  async install(@Req() req: Request, @Res() res: Response) {
    const user = (req as Request & { user: { id: string } }).user;
    const slug = env("GITHUB_APP_SLUG") ?? "heizen";
    const state = signState({ kind: "admin-connection", userId: user.id });
    const url = `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
    return res.redirect(url);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.connections.remove(id, user?.id ?? null);
  }
}
