import { Injectable, Inject } from "@nestjs/common";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class AgentService {
  private chatHistory = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly projects: ProjectsService,
  ) {}

  async buildContext(orgId: string, projectId: string): Promise<string> {
    const project = await this.projects.get(orgId, projectId);
    const envs = project.environments;
    const latestDeployments = await this.prisma.deployment.findMany({
      where: { environmentId: { in: envs.map((e) => e.id) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { logs: { where: { level: "error" }, take: 10 } },
    });

    return JSON.stringify(
      {
        project: {
          name: project.name,
          slug: project.slug,
          github: project.githubOwner
            ? `${project.githubOwner}/${project.githubRepo}`
            : null,
        },
        environments: envs.map((e) => ({
          type: e.type,
          status: e.status,
          region: e.region,
          heizenConfig: e.heizenConfig,
          lastDeployedAt: e.lastDeployedAt,
        })),
        recentDeployments: latestDeployments.map((d) => ({
          id: d.id,
          status: d.status,
          errorMessage: d.errorMessage,
          startedAt: d.startedAt,
          completedAt: d.completedAt,
          errorLogs: d.logs.map((l) => l.message),
        })),
      },
      null,
      2,
    );
  }

  async *chat(orgId: string, projectId: string, message: string) {
    const key = `${orgId}:${projectId}`;
    const history = this.chatHistory.get(key) ?? [];
    history.push({ role: "user", content: message });

    const context = await this.buildContext(orgId, projectId);

    const result = streamText({
      model: anthropic("claude-haiku-4-5"),
      system: `You are Heizen, an SRE deployment assistant. Answer questions about the project's deployment status, detected services, and build failures using the context below. Do not make up information — only use what's in the context.

Project context:
${context}`,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    let fullMessage = "";
    for await (const chunk of result.textStream) {
      fullMessage += chunk;
      yield { text: chunk };
    }

    history.push({ role: "assistant", content: fullMessage });
    this.chatHistory.set(key, history.slice(-20));
    yield { type: "done" as const, fullMessage };
  }

  getHistory(orgId: string, projectId: string) {
    return this.chatHistory.get(`${orgId}:${projectId}`) ?? [];
  }

  clearHistory(orgId: string, projectId: string) {
    this.chatHistory.delete(`${orgId}:${projectId}`);
    return { ok: true };
  }
}
