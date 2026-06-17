import { Injectable, Inject, Logger } from "@nestjs/common";
import { generateText, tool, experimental_createMCPClient } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@heizen/db";
import type { ChatResponse, ProposedAction, ChatTurn } from "@heizen/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ProjectsService } from "../projects/projects.service";
import { DeploymentsService } from "../deployments/deployments.service";
import { IncidentsService } from "../observability/incidents.service";
import { ObservabilityService } from "../observability/observability.service";
import { IncidentAnalysisService } from "../observability/incident-analysis.service";
import { VmExecService } from "../observability/vm-exec.service";
import { LogsService } from "../observability/logs.service";
import { LogAnalysisService } from "../observability/log-analysis.service";
import { anthropicModel, isLlmConfigured } from "../common/llm";
import { env as readEnv } from "../common/env";

interface EnvRow {
  id: string;
  type: string;
  status: string;
  region: string | null;
  deployStrategy: string | null;
  lastDeployedAt: Date | null;
  stackOutputs: unknown;
}

const SYSTEM_PROMPT = `You are Heizen's SRE agent — a ChatOps copilot embedded in an infra-deploy platform that ships customer projects to AWS (ECS Fargate, a single EC2 box running docker-compose, or Lightsail).

Capabilities:
- READ: environments, deploy history, incidents, app logs (with error clustering), live per-service container status (EC2 boxes).
- ACT (operators only, executes immediately): scan an environment for incidents, acknowledge/resolve incidents, run a deep root-cause analysis on an incident, run a deep log analysis.
- PROPOSE (operators only, requires human confirmation in the UI): deploy, destroy, restart a service. You never execute these yourself — propose_* surfaces a confirm card. Phrase it as "I've prepared X — confirm below." NEVER claim a deploy/destroy/restart already happened.
- If Grafana tools are available (names prefixed grafana_ or similar), use them for metrics/alerts/dashboards questions.

BIAS TO ACTION — this is the #1 rule:
- Call tools FIRST, answer from their results. Never ask the user for anything a tool can tell you.
- NEVER ask which environment to use. The environment inventory is below: if only one environment is LIVE, every question is about it. If several are live and the question is ambiguous, check the cheap reads on all of them and answer about each.
- Never ask permission to read (list/get/logs/status tools) — just do it.
- A clarifying question is allowed ONLY before a proposal (deploy/destroy/restart) whose target is genuinely ambiguous — and even then, propose your best guess and say what you assumed.
- Every reply must END WITH A RESULT: a status, a finding, a verdict, or a prepared action. Never end with only a question.

Triage like an SRE:
- Problem reports ("broken", "down", "slow", "weird"): check incidents AND recent deployments AND logs (get_logs, then analyze_logs for a verdict) AND, on EC2, service status — then answer with what you FOUND. A deploy that finished right before an incident started is the prime suspect.
- Quote recurring error clusters (with counts), not single lines.
- Before proposing a destroy, state that it tears down all AWS resources and data.

Format (rendered as markdown in a narrow chat panel):
- Compact: short paragraphs, bullet lists, **bold** for key facts, backticks for service/env names and errors.
- No headings unless the answer is long. No filler ("Great question", "Let me know if…"). No restating the question.`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly projects: ProjectsService,
    private readonly deployments: DeploymentsService,
    private readonly incidents: IncidentsService,
    private readonly observability: ObservabilityService,
    private readonly analysis: IncidentAnalysisService,
    private readonly vmExec: VmExecService,
    private readonly logsService: LogsService,
    private readonly logAnalysis: LogAnalysisService,
  ) {}

  async chat(
    orgId: string,
    projectId: string,
    userId: string,
    message: string,
    history: ChatTurn[] = [],
  ): Promise<ChatResponse> {
    if (!isLlmConfigured()) {
      return {
        message:
          "The SRE agent isn't configured (missing ANTHROPIC_API_KEY). Set it on the platform to enable chat.",
      };
    }

    const project = (await this.projects.get(orgId, projectId)) as unknown as {
      slug: string;
      environments: EnvRow[];
    };
    const envs = project.environments ?? [];
    const findEnv = (t: string) =>
      envs.find((e) => e.type === t.toUpperCase());
    const strategyOf = (e: EnvRow) =>
      e.deployStrategy ?? (e.type === "PRODUCTION" ? "ECS" : "LIGHTSAIL");
    const canOperate = await this.canOperate(userId, projectId);

    let proposedAction: ProposedAction | null = null;
    const envParam = z.enum(["staging", "production"]);

    // ── Read tools (any project member) ───────────────────────────────
    const readTools = {
      list_environments: tool({
        description:
          "List this project's environments with status, deploy strategy, region, and last-deployed time.",
        parameters: z.object({}),
        execute: async () =>
          envs.map((e) => ({
            type: e.type,
            status: e.status,
            strategy: strategyOf(e),
            region: e.region,
            lastDeployedAt: e.lastDeployedAt,
          })),
      }),
      get_recent_deployments: tool({
        description: "Recent deployments (deploy + destroy runs) for an environment.",
        parameters: z.object({ environment: envParam }),
        execute: async ({ environment }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          const list = await this.deployments.list(orgId, projectId, e.id);
          return list.slice(0, 5).map((d) => ({
            id: d.id,
            kind: d.kind,
            status: d.status,
            createdAt: d.createdAt,
            completedAt: d.completedAt,
            error: d.errorMessage,
          }));
        },
      }),
      list_incidents: tool({
        description:
          "Open + recent incidents for an environment. Returns ids usable with acknowledge/resolve/analyze tools.",
        parameters: z.object({ environment: envParam }),
        execute: async ({ environment }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          const list = await this.incidents.list(orgId, projectId, e.id);
          return list.slice(0, 10).map((i) => ({
            id: i.id,
            severity: i.severity,
            status: i.status,
            source: i.source,
            title: i.title,
            suggestedRemedy: i.suggestedRemedy,
            analyzed: !!i.analysis,
            occurrences: i.occurrences,
            lastSeenAt: i.lastSeenAt,
            createdAt: i.createdAt,
          }));
        },
      }),
      get_logs: tool({
        description:
          "App logs for an environment (Grafana Loki when connected, else on-box docker compose logs on EC2). Returns error/warn counts, recurring error clusters, and recent lines. Use BEFORE answering 'what's wrong/slow' questions.",
        parameters: z.object({
          environment: envParam,
          service: z.string().optional().describe("Limit to one compose service"),
          minutes: z.number().optional().describe("Window, default 30"),
        }),
        execute: async ({ environment, service, minutes }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          try {
            const data = await this.logsService.fetch(orgId, projectId, e.id, {
              service,
              minutes,
              limit: 300,
            });
            return {
              source: data.source,
              windowMinutes: data.windowMinutes,
              stats: data.stats,
              // Token-bounded: clusters carry the signal; raw lines are
              // a small sample for context.
              recentLines: data.lines.slice(0, 40).map(
                (l) => `${l.ts ?? "-"} ${l.service ?? "-"} | ${l.line.slice(0, 250)}`,
              ),
              truncated: data.truncated,
            };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
      get_service_status: tool({
        description:
          "Live per-service container status (docker compose ps) on an EC2-deployed environment. Strongest signal for 'what exactly is down'.",
        parameters: z.object({ environment: envParam }),
        execute: async ({ environment }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          const full = await this.prisma.environment.findUnique({
            where: { id: e.id },
          });
          if (!full || !this.vmExec.canExec(full)) {
            return {
              note: "Per-service status is only available for live EC2 deploys; use list_incidents / the HTTP probe for this environment.",
            };
          }
          try {
            return await this.vmExec.serviceStatus(full);
          } catch (err) {
            return { error: `Status lookup failed: ${(err as Error).message}` };
          }
        },
      }),
    };

    // ── Operator tools: immediate (low-risk) + proposals (confirmed) ──
    const operatorTools = {
      scan_environment: tool({
        description:
          "Run an incident scan NOW (HTTP probe + container health + Grafana). Executes immediately; returns the incident list.",
        parameters: z.object({ environment: envParam }),
        execute: async ({ environment }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          try {
            const list = await this.observability.scan(orgId, projectId, e.id);
            const open = list.filter((i) => i.status !== "RESOLVED");
            return {
              openCount: open.length,
              incidents: open.map((i) => ({
                id: i.id,
                severity: i.severity,
                title: i.title,
              })),
            };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
      acknowledge_incident: tool({
        description:
          "Acknowledge an open incident (marks a human is on it). Executes immediately.",
        parameters: z.object({ environment: envParam, incidentId: z.string() }),
        execute: async ({ environment, incidentId }) =>
          this.setIncidentStatus(orgId, projectId, environment, incidentId, "ACKNOWLEDGED", findEnv),
      }),
      resolve_incident: tool({
        description: "Resolve an incident. Executes immediately.",
        parameters: z.object({ environment: envParam, incidentId: z.string() }),
        execute: async ({ environment, incidentId }) =>
          this.setIncidentStatus(orgId, projectId, environment, incidentId, "RESOLVED", findEnv),
      }),
      analyze_logs: tool({
        description:
          "Deep log analysis: clusters errors, looks for slowness evidence (timeouts, retries, slow queries), and produces a structured verdict with recommended actions. Use for 'why is the app slow' / 'what went down' questions. Executes immediately (~10s).",
        parameters: z.object({
          environment: envParam,
          service: z.string().optional(),
          minutes: z.number().optional().describe("Window, default 60"),
          question: z
            .string()
            .optional()
            .describe("The operator's actual question, to focus the analysis"),
        }),
        execute: async ({ environment, service, minutes, question }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          try {
            return await this.logAnalysis.analyze(orgId, projectId, e.id, {
              service,
              minutes,
              question,
            });
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
      analyze_incident: tool({
        description:
          "Deep root-cause analysis of one incident: correlates the deploy timeline, live container state, and sibling incidents. Use when the user asks WHY something broke. Executes immediately (takes ~10s).",
        parameters: z.object({ environment: envParam, incidentId: z.string() }),
        execute: async ({ environment, incidentId }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          try {
            const updated = await this.analysis.analyze(orgId, projectId, e.id, incidentId);
            return updated.analysis ?? { error: "Analysis produced no result." };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
      propose_deploy: tool({
        description:
          "Propose deploying an environment. Does NOT deploy — surfaces a confirm card for the human.",
        parameters: z.object({ environment: envParam }),
        execute: async ({ environment }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          proposedAction = {
            kind: "deploy",
            projectId,
            envId: e.id,
            envType: environment,
            label: `Deploy ${environment} (${strategyOf(e)})`,
          };
          return {
            proposed: true,
            currentStatus: e.status,
            note: "Prepared. Awaiting the human's confirmation in the UI.",
          };
        },
      }),
      propose_destroy: tool({
        description:
          "Propose destroying an environment (tears down ALL AWS resources + data). Does NOT execute — surfaces a confirm card.",
        parameters: z.object({ environment: envParam }),
        execute: async ({ environment }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          proposedAction = {
            kind: "destroy",
            projectId,
            envId: e.id,
            envType: environment,
            label: `Destroy ${environment}`,
          };
          return {
            proposed: true,
            warning: "Irreversible — all resources and data will be removed.",
            note: "Prepared. Awaiting the human's confirmation in the UI.",
          };
        },
      }),
      propose_restart_service: tool({
        description:
          "Propose restarting one compose service in place on an EC2-deployed environment (no redeploy). Does NOT execute — surfaces a confirm card.",
        parameters: z.object({
          environment: envParam,
          service: z.string().describe("Compose service name, e.g. 'api' or 'web'"),
        }),
        execute: async ({ environment, service }) => {
          const e = findEnv(environment);
          if (!e) return { error: `No ${environment} environment.` };
          if (strategyOf(e) !== "EC2_COMPOSE") {
            return {
              error: "In-place restarts are only supported on EC2 deploys. Propose a redeploy instead.",
            };
          }
          proposedAction = {
            kind: "restart",
            projectId,
            envId: e.id,
            envType: environment,
            serviceName: service,
            label: `Restart "${service}" on ${environment}`,
          };
          return {
            proposed: true,
            note: "Prepared. Awaiting the human's confirmation in the UI.",
          };
        },
      }),
    };

    // ── Optional Grafana MCP: merge its tools when configured ─────────
    const { tools: mcpTools, close: closeMcp } = await this.grafanaMcpTools();

    const tools = {
      ...mcpTools,
      ...readTools,
      ...(canOperate ? operatorTools : {}),
    };

    // Live env inventory in the system prompt kills the agent's #1 bad
    // habit: asking "which environment?" when the answer is right here.
    const inventory =
      envs
        .map(
          (e) =>
            `- ${e.type.toLowerCase()}: ${e.status}, ${strategyOf(e)}${e.region ? `, ${e.region}` : ""}${e.lastDeployedAt ? `, last deployed ${new Date(e.lastDeployedAt).toISOString()}` : ""}`,
        )
        .join("\n") || "(no environments created yet)";
    const system =
      `${SYSTEM_PROMPT}\n\n## This project's environments (live inventory)\n${inventory}\n\n` +
      `Caller permission tier: ${canOperate ? "operator — full toolset available" : "viewer — read-only tools; for actions they need the OWNER or DEPLOYER project role"}.`;

    const baseMessages = [
      ...history.slice(-8).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: message },
    ];

    try {
      const result = await generateText({
        model: anthropicModel(),
        system,
        messages: baseMessages,
        tools,
        maxSteps: 12,
      });

      let text = result.text.trim();
      if (!text) {
        // The run ended on a tool call (step budget) — never show the
        // user an empty reply. One more pass, no tools, to turn the
        // gathered results into an answer.
        const followUp = await generateText({
          model: anthropicModel(),
          system:
            `${system}\n\nFinal-answer mode: tools are no longer available. ` +
            `Using the tool results already in this conversation, give the ` +
            `user a direct, complete answer to their question NOW.`,
          messages: [...baseMessages, ...result.response.messages],
        });
        text = followUp.text.trim() || "I gathered the data but couldn't compose an answer — try rephrasing.";
      }

      return { message: text, proposedAction };
    } finally {
      await closeMcp();
    }
  }

  /** Same semantics as ProjectRoleGuard: system ADMIN or OWNER/DEPLOYER member. */
  private async canOperate(userId: string, projectId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systemRole: true },
    });
    if (user?.systemRole === "ADMIN") return true;
    const member = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    return member?.role === "OWNER" || member?.role === "DEPLOYER";
  }

  private async setIncidentStatus(
    orgId: string,
    projectId: string,
    environment: string,
    incidentId: string,
    status: "ACKNOWLEDGED" | "RESOLVED",
    findEnv: (t: string) => EnvRow | undefined,
  ) {
    const e = findEnv(environment);
    if (!e) return { error: `No ${environment} environment.` };
    try {
      const updated = await this.incidents.updateStatus(
        orgId,
        projectId,
        e.id,
        incidentId,
        status,
      );
      return { ok: true, id: updated.id, status: updated.status, title: updated.title };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /**
   * Connect to a Grafana MCP server (GRAFANA_MCP_URL, optional
   * GRAFANA_MCP_TOKEN) and expose its tools to the agent. Returns empty
   * tools + no-op close when unconfigured or unreachable — the agent
   * still works, just without Grafana superpowers.
   */
  private async grafanaMcpTools(): Promise<{
    tools: Record<string, never> | Awaited<ReturnType<McpClient["tools"]>>;
    close: () => Promise<void>;
  }> {
    const url = readEnv("GRAFANA_MCP_URL");
    if (!url) return { tools: {}, close: async () => {} };
    try {
      const token = readEnv("GRAFANA_MCP_TOKEN");
      const client = await experimental_createMCPClient({
        transport: {
          type: "sse",
          url,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        },
      });
      const tools = await client.tools();
      return {
        tools,
        close: () => client.close().catch(() => undefined),
      };
    } catch (err) {
      this.logger.warn(
        `Grafana MCP unavailable (${(err as Error).message}) — continuing without it`,
      );
      return { tools: {}, close: async () => {} };
    }
  }
}

type McpClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;
