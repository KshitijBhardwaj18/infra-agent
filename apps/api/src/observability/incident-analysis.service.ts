import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { generateObject } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@heizen/db";
import type { IncidentAnalysis } from "@heizen/shared";
import { PRISMA } from "../prisma/prisma.module";
import { EnvironmentsService } from "../environments/environments.service";
import { IncidentsService } from "./incidents.service";
import { VmExecService } from "./vm-exec.service";
import { LogsService } from "./logs.service";
import { anthropicModel, isLlmConfigured } from "../common/llm";

/** How far back a deployment can be and still count as "correlated". */
const CORRELATION_WINDOW_MS = 60 * 60 * 1000;

const ANALYSIS_SCHEMA = z.object({
  summary: z
    .string()
    .describe("One-paragraph incident summary for an on-call engineer."),
  rootCause: z
    .string()
    .describe("The single most probable root cause, stated concretely."),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z
    .array(z.string())
    .describe("Specific observations from the provided context that support the root cause."),
  suggestedActions: z
    .array(z.string())
    .describe("Ordered, concrete next steps (commands, checks, rollback) for THIS stack."),
  deploymentCorrelated: z
    .boolean()
    .describe("True if the candidate deployment likely caused or contributed to this incident."),
});

/**
 * The intelligence layer: assembles everything we know around one
 * incident (deploy timeline, sibling incidents, live container state,
 * stack shape) and produces a structured root-cause analysis. Deploy
 * correlation is computed in code (timestamps don't hallucinate); the
 * model judges whether the correlation is causal.
 */
@Injectable()
export class IncidentAnalysisService {
  private readonly logger = new Logger(IncidentAnalysisService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly environments: EnvironmentsService,
    private readonly incidents: IncidentsService,
    private readonly vmExec: VmExecService,
    private readonly logs: LogsService,
  ) {}

  async analyze(
    orgId: string,
    projectId: string,
    envId: string,
    incidentId: string,
  ) {
    if (!isLlmConfigured()) {
      throw new BadRequestException(
        "Incident analysis requires the agent (ANTHROPIC_API_KEY) to be configured.",
      );
    }

    const env = await this.environments.get(orgId, projectId, envId);
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, environmentId: envId },
    });
    if (!incident) throw new NotFoundException("Incident not found");

    // ── Context: deploy timeline + correlation candidate ────────────
    const deployments = await this.prisma.deployment.findMany({
      where: { environmentId: envId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        kind: true,
        status: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });
    const incidentAt = incident.createdAt.getTime();
    const candidate = deployments.find((d) => {
      const t = (d.completedAt ?? d.createdAt).getTime();
      return t <= incidentAt && incidentAt - t <= CORRELATION_WINDOW_MS;
    });

    const siblings = await this.prisma.incident.findMany({
      where: {
        environmentId: envId,
        id: { not: incidentId },
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      take: 5,
      select: { severity: true, source: true, title: true },
    });

    // Live container state is the strongest evidence — best-effort.
    let serviceStatus = "unavailable (not an SSM-managed EC2 box)";
    if (this.vmExec.canExec(env)) {
      try {
        const services = await this.vmExec.serviceStatus(env);
        serviceStatus = services
          .map((s) => `${s.name}: ${s.status || s.state}${s.health ? ` [${s.health}]` : ""}`)
          .join("\n");
      } catch (err) {
        serviceStatus = `lookup failed: ${(err as Error).message}`;
      }
    }

    // App logs around the incident — error clusters say WHY, not just
    // that something is down. Best-effort: analysis works without them.
    let logContext = "unavailable (no log source configured)";
    try {
      const logData = await this.logs.fetch(orgId, projectId, envId, {
        minutes: 60,
        limit: 800,
      });
      const clusters = logData.stats.clusters
        .slice(0, 10)
        .map((c) => `- [${c.level} ×${c.count}] ${c.sample}`)
        .join("\n");
      logContext =
        `${logData.stats.total} lines in the last 60m ` +
        `(${logData.stats.errors} error-ish, ${logData.stats.warns} warn-ish) via ${logData.source}.\n` +
        (clusters || "(no recurring error/warn clusters)");
    } catch {
      // keep the default note
    }

    const strategy =
      env.deployStrategy ?? (env.type === "PRODUCTION" ? "ECS" : "LIGHTSAIL");
    const deployLines = deployments
      .map((d) => {
        const when = (d.completedAt ?? d.createdAt).toISOString();
        const marker = candidate?.id === d.id ? "  <-- candidate (within 60m before incident)" : "";
        return `- ${d.kind} ${d.status} at ${when}${d.errorMessage ? ` — error: ${d.errorMessage.slice(0, 300)}` : ""}${marker}`;
      })
      .join("\n");

    const { object } = await generateObject({
      model: anthropicModel(),
      schema: ANALYSIS_SCHEMA,
      system:
        "You are an SRE performing root-cause analysis on one incident. " +
        "Reason only from the provided context — never invent metrics, " +
        "logs, or resources that aren't shown. Suggested actions must be " +
        "concrete for this stack (the deploy strategy and services listed), " +
        "ordered by likelihood of fixing the issue. If the evidence is " +
        "thin, say so via a lower confidence rather than overclaiming.",
      prompt:
        `## Incident\n` +
        `Title: ${incident.title}\nSeverity: ${incident.severity}. Source: ${incident.source}.\n` +
        `Opened: ${incident.createdAt.toISOString()}\n` +
        `Detail: ${incident.detail ?? "(none)"}\n\n` +
        `## Environment\n` +
        `Type: ${env.type}. Deploy strategy: ${strategy}. Region: ${env.region ?? "unknown"}.\n` +
        `Stack outputs: ${safeJson(env.stackOutputs)}\n\n` +
        `## Live container state\n${serviceStatus}\n\n` +
        `## App logs (last 60m)\n${logContext}\n\n` +
        `## Recent deployments (newest first)\n${deployLines || "(none)"}\n\n` +
        `## Other open incidents on this environment\n` +
        `${siblings.map((s) => `- [${s.severity}/${s.source}] ${s.title}`).join("\n") || "(none)"}\n\n` +
        `Analyze the incident.`,
    });

    const analysis: IncidentAnalysis = {
      summary: object.summary,
      rootCause: object.rootCause,
      confidence: object.confidence,
      evidence: object.evidence,
      suggestedActions: object.suggestedActions,
      correlatedDeploymentId:
        object.deploymentCorrelated && candidate ? candidate.id : null,
      analyzedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        analysis: analysis as unknown as object,
        // Backfill the quick remedy from the deep analysis if empty.
        suggestedRemedy:
          incident.suggestedRemedy ?? object.suggestedActions[0] ?? null,
      },
    });
    await this.incidents.broadcast(orgId, envId);
    return updated;
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}).slice(0, 1500);
  } catch {
    return "{}";
  }
}
