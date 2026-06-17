import { Injectable, BadRequestException } from "@nestjs/common";
import { generateObject } from "ai";
import { z } from "zod";
import type { LogAnalysis, LogsResponse } from "@heizen/shared";
import { LogsService } from "./logs.service";
import { anthropicModel, isLlmConfigured } from "../common/llm";

const LOG_VERDICT_SCHEMA = z.object({
  health: z
    .enum(["healthy", "degraded", "down", "unknown"])
    .describe("Overall verdict for the app based on these logs."),
  summary: z
    .string()
    .describe("2-4 sentences: what the logs say is happening right now."),
  issues: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(["CRITICAL", "WARNING", "INFO"]),
      evidence: z
        .string()
        .describe("The specific log signature/lines that show this issue."),
      likelyCause: z.string(),
    }),
  ),
  slownessIndicators: z
    .array(z.string())
    .describe(
      "Latency evidence: timeouts, slow queries, retries, queue backlogs, connection-pool exhaustion. Empty if none.",
    ),
  recommendedActions: z
    .array(z.string())
    .describe("Ordered, concrete next steps for THIS stack."),
});

/** Token-bounded slice of raw lines handed to the model. */
const RAW_SAMPLE_CHARS = 9_000;

/**
 * Log intelligence: turn a window of app logs into an operational
 * verdict. The heavy lifting (clustering, counting) happens in code via
 * LogsService stats; the model interprets digested clusters plus a
 * bounded raw sample — built for "what went down?" and "why does the
 * api feel slow?" questions.
 */
@Injectable()
export class LogAnalysisService {
  constructor(private readonly logs: LogsService) {}

  async analyze(
    orgId: string,
    projectId: string,
    envId: string,
    opts: { service?: string; minutes?: number; question?: string } = {},
  ): Promise<LogAnalysis> {
    if (!isLlmConfigured()) {
      throw new BadRequestException(
        "Log analysis requires the agent (ANTHROPIC_API_KEY) to be configured.",
      );
    }

    const minutes = opts.minutes ?? 60;
    const data = await this.logs.fetch(orgId, projectId, envId, {
      service: opts.service,
      minutes,
      limit: 1000,
    });

    const { object } = await generateObject({
      model: anthropicModel(),
      schema: LOG_VERDICT_SCHEMA,
      system:
        "You are an SRE reading production app logs. Reason only from " +
        "what's shown — never invent log lines, services, or metrics. " +
        "Recurring clusters matter more than one-off lines. Pay special " +
        "attention to latency evidence (timeouts, retries, slow queries, " +
        "pool exhaustion) and crash/restart loops. If logs look routine, " +
        "say healthy — don't manufacture problems.",
      prompt: buildPrompt(data, opts.service, opts.question),
    });

    return {
      ...object,
      source: data.source,
      windowMinutes: data.windowMinutes,
      analyzedAt: new Date().toISOString(),
    };
  }
}

function buildPrompt(
  data: LogsResponse,
  service: string | undefined,
  question: string | undefined,
): string {
  const { stats } = data;
  const clusterLines =
    stats.clusters
      .map((c) => `- [${c.level} ×${c.count}] ${c.sample}`)
      .join("\n") || "(no error/warn clusters)";

  // Newest-first raw sample, token-bounded.
  let sample = "";
  for (const l of data.lines) {
    const row = `${l.ts ?? "-"} ${l.service ?? "-"} | ${l.line}\n`;
    if (sample.length + row.length > RAW_SAMPLE_CHARS) break;
    sample += row;
  }

  return (
    `## Window\nLast ${data.windowMinutes} minutes` +
    `${service ? `, service "${service}"` : ", all services"}. ` +
    `Source: ${data.source === "loki" ? "Grafana Loki" : data.source === "cloudwatch" ? "CloudWatch Logs" : "on-box docker compose"}.` +
    `${data.truncated ? " (volume truncated — counts are lower bounds)" : ""}\n\n` +
    `## Volume\n${stats.total} lines, ${stats.errors} error-ish, ${stats.warns} warn-ish.\n\n` +
    `## Recurring clusters (normalized, by count)\n${clusterLines}\n\n` +
    `## Raw sample (newest first)\n${sample || "(no lines)"}\n\n` +
    (question ? `## Operator question\n${question}\n\n` : "") +
    `Produce the verdict.`
  );
}
