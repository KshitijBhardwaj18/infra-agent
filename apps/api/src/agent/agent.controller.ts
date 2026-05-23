import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../common/guards/auth.guard";
import { OrgGuard } from "../common/guards/org.guard";
import { CurrentOrg } from "../common/decorators/current-org";
import { AgentService } from "./agent.service";

@Controller("api/projects/:projectId/agent/chat")
@UseGuards(AuthGuard, OrgGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post()
  async chat(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { message: string },
  ) {
    const chunks: string[] = [];
    for await (const event of this.agent.chat(orgId, projectId, body.message)) {
      if ("text" in event && event.text) chunks.push(event.text);
    }
    return { message: chunks.join("") };
  }

  @Get("stream")
  async stream(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { message: string },
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const event of this.agent.chat(orgId, projectId, body.message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  }

  @Post("stream")
  async streamPost(
    @CurrentOrg() orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { message: string },
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const event of this.agent.chat(orgId, projectId, body.message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  }

  @Get("history")
  history(@CurrentOrg() orgId: string, @Param("projectId") projectId: string) {
    return this.agent.getHistory(orgId, projectId);
  }

  @Delete("history")
  clearHistory(@CurrentOrg() orgId: string, @Param("projectId") projectId: string) {
    return this.agent.clearHistory(orgId, projectId);
  }
}
