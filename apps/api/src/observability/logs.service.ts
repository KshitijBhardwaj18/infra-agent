import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import type { PrismaClient } from "@heizen/db";
import type {
  LogLine,
  LogCluster,
  LogStats,
  LogsResponse,
} from "@heizen/shared";
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { assumeCustomerRole } from "@heizen/infra-core";
import { PRISMA } from "../prisma/prisma.module";
import { EnvironmentsService } from "../environments/environments.service";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { VmExecService } from "./vm-exec.service";
import { env as readEnv } from "../common/env";

/** Reads a string field from a decrypted connection config, if present. */
function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

interface EnvRowLike {
  id: string;
  projectId: string;
  type: string;
  status: string;
  region: string | null;
  deployStrategy: string | null;
  awsRoleArn: string | null;
  pulumiStackName: string | null;
  stackOutputs: unknown;
}

const MAX_LINES = 1000;

/**
 * App-log retrieval for a deployed environment, provider-resolved:
 *
 * 1. Grafana Loki (primary): query_range through the Grafana datasource
 *    proxy. Connection comes from the environment's own grafana-loki data
 *    source if set (bring-your-own Grafana), else the platform-wide
 *    GRAFANA_URL + GRAFANA_TOKEN env. Selector defaults to the labels
 *    promtail/alloy attach out of the box ({compose_project="<slug>"});
 *    override per-connection or with GRAFANA_LOKI_SELECTOR ($project/$env).
 * 2. On-box (fallback): `docker compose logs` over SSM for EC2 deploys —
 *    zero log-shipping setup required.
 *
 * Every response carries code-computed stats (error/warn counts +
 * clustered error signatures) so callers — humans and the agent — reason
 * over digested facts, not raw noise.
 */
@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly environments: EnvironmentsService,
    private readonly dataSources: DataSourcesService,
    private readonly vmExec: VmExecService,
  ) {}

  async fetch(
    orgId: string,
    projectId: string,
    envId: string,
    opts: { service?: string; minutes?: number; limit?: number } = {},
  ): Promise<LogsResponse> {
    const env = (await this.environments.get(
      orgId,
      projectId,
      envId,
    )) as unknown as EnvRowLike;
    if (env.status !== "LIVE") {
      throw new BadRequestException("Environment is not live — no logs to read.");
    }

    const minutes = clamp(opts.minutes ?? 30, 5, 24 * 60);
    const limit = clamp(opts.limit ?? 500, 50, MAX_LINES);

    // ── Provider 1: Grafana Loki ─────────────────────────────────────
    // Prefer the environment's own connection (bring-your-own Grafana);
    // fall back to the platform-wide GRAFANA_* env for single-tenant setups.
    const lokiConn = await this.dataSources.getDecryptedConfig(
      envId,
      "grafana-loki",
    );
    const grafanaUrl = asString(lokiConn?.url) ?? readEnv("GRAFANA_URL");
    const grafanaToken = asString(lokiConn?.token) ?? readEnv("GRAFANA_TOKEN");
    const lokiSelector =
      asString(lokiConn?.selector) ??
      readEnv("GRAFANA_LOKI_SELECTOR") ??
      '{compose_project="$project"}';
    if (grafanaUrl && grafanaToken) {
      try {
        const slug = await this.projectSlug(env.projectId);
        const lines = await this.queryLoki(
          grafanaUrl,
          grafanaToken,
          lokiSelector,
          slug,
          env.type,
          opts.service,
          minutes,
          limit,
        );
        if (lines !== null) {
          return {
            source: "loki",
            windowMinutes: minutes,
            lines,
            truncated: lines.length >= limit,
            stats: computeStats(lines),
          };
        }
      } catch (err) {
        this.logger.warn(
          `Loki query failed for env ${envId}: ${(err as Error).message} — falling back to on-box logs`,
        );
      }
    }

    // ── Provider 2: CloudWatch Logs (ECS via the awslogs driver) ─────
    // ECS tasks have no box to SSM into; their stdout lands in CloudWatch.
    // Read access comes from the deploy role we already assume.
    if (
      env.deployStrategy === "ECS" &&
      env.awsRoleArn &&
      env.region &&
      env.pulumiStackName
    ) {
      try {
        const lines = await this.queryCloudWatchLogs(
          env,
          opts.service,
          minutes,
          limit,
        );
        if (lines !== null) {
          return {
            source: "cloudwatch",
            windowMinutes: minutes,
            lines,
            truncated: lines.length >= limit,
            stats: computeStats(lines),
          };
        }
      } catch (err) {
        this.logger.warn(
          `CloudWatch Logs query failed for env ${envId}: ${(err as Error).message}`,
        );
      }
    }

    // ── Provider 3: on-box via SSM (EC2 only) ────────────────────────
    if (this.vmExec.canExec(env)) {
      const raw = await this.vmExec.logs(env, {
        service: opts.service,
        sinceMinutes: minutes,
        tail: Math.min(limit, 500),
      });
      const lines = parseComposeLogs(raw);
      return {
        source: "vm",
        windowMinutes: minutes,
        lines,
        truncated: lines.length >= 300 || raw.length >= 22_000,
        stats: computeStats(lines),
      };
    }

    throw new BadRequestException(
      "No log source available: ECS deploys read from CloudWatch Logs, EC2 deploys read on-box over SSM, or connect Grafana (GRAFANA_URL/GRAFANA_TOKEN with a Loki datasource).",
    );
  }

  private async projectSlug(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });
    return project?.slug ?? "";
  }

  /**
   * ECS tasks ship stdout to a CloudWatch Logs group via the awslogs
   * driver. Pulumi auto-names it `<stackName>-logs-<hash>`, so resolve the
   * real name by prefix, then read recent events. Returns null when no
   * matching group exists yet (brand-new stack). awslogs stream names are
   * `<service>/app/<task-id>`, so the leading segment is the service.
   */
  private async queryCloudWatchLogs(
    env: EnvRowLike,
    service: string | undefined,
    minutes: number,
    limit: number,
  ): Promise<LogLine[] | null> {
    const creds = await assumeCustomerRole(env.awsRoleArn!, env.id, env.region!);
    const client = new CloudWatchLogsClient({
      region: env.region!,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
    try {
      const groups = await client.send(
        new DescribeLogGroupsCommand({
          logGroupNamePrefix: `${env.pulumiStackName}-logs`,
          limit: 5,
        }),
      );
      const group = groups.logGroups?.[0]?.logGroupName;
      // This early return still runs the finally below (JS guarantees a
      // finally executes on return), so the client is destroyed here too.
      if (!group) return null;

      const res = await client.send(
        new FilterLogEventsCommand({
          logGroupName: group,
          startTime: Date.now() - minutes * 60_000,
          limit: Math.min(limit, MAX_LINES),
          ...(service ? { logStreamNamePrefix: service } : {}),
        }),
      );

      const lines: LogLine[] = (res.events ?? []).map((e) => ({
        ts: e.timestamp ? new Date(e.timestamp).toISOString() : null,
        service: e.logStreamName ? e.logStreamName.split("/")[0] || null : null,
        line: e.message ?? "",
      }));
      // FilterLogEvents returns oldest-first; align newest-first to match
      // the Loki/on-box providers. Undated lines sort to the end.
      lines.sort((a, b) => {
        if (a.ts === null) return 1;
        if (b.ts === null) return -1;
        return a.ts < b.ts ? 1 : -1;
      });
      return lines.slice(0, limit);
    } finally {
      client.destroy();
    }
  }

  /** Returns null when Grafana has no Loki datasource (→ fallback). */
  private async queryLoki(
    grafanaUrl: string,
    grafanaToken: string,
    selectorTemplate: string,
    projectSlug: string,
    envType: string,
    service: string | undefined,
    minutes: number,
    limit: number,
  ): Promise<LogLine[] | null> {
    const base = grafanaUrl.replace(/\/$/, "");
    const headers = {
      Authorization: `Bearer ${grafanaToken}`,
      "Content-Type": "application/json",
    };

    const uid = await this.lokiDatasourceUid(base, headers);
    if (!uid) return null;

    let selector = selectorTemplate
      .replace(/\$project/g, projectSlug)
      .replace(/\$env/g, envType.toLowerCase());
    if (service) {
      // Inject the service label into the selector's closing brace.
      selector = selector.replace(/\}\s*$/, `, compose_service="${service}"}`);
    }

    const end = Date.now();
    const start = end - minutes * 60_000;
    const params = new URLSearchParams({
      query: selector,
      start: `${start * 1e6}`,
      end: `${end * 1e6}`,
      limit: String(limit),
      direction: "backward",
    });

    const res = await fetchWithTimeout(
      `${base}/api/datasources/proxy/uid/${uid}/loki/api/v1/query_range?${params}`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(`Loki query_range HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      data?: {
        result?: Array<{
          stream?: Record<string, string>;
          values?: Array<[string, string]>;
        }>;
      };
    };

    const lines: LogLine[] = [];
    for (const stream of body.data?.result ?? []) {
      const svc =
        stream.stream?.compose_service ??
        stream.stream?.service_name ??
        stream.stream?.container ??
        null;
      for (const [ns, text] of stream.values ?? []) {
        lines.push({
          ts: new Date(Number(ns) / 1e6).toISOString(),
          service: svc,
          line: text,
        });
      }
    }
    // Streams arrive separately — merge into one newest-first timeline.
    lines.sort((a, b) => (a.ts! < b.ts! ? 1 : -1));
    return lines.slice(0, limit);
  }

  private async lokiDatasourceUid(
    base: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    const res = await fetchWithTimeout(`${base}/api/datasources`, { headers });
    if (!res.ok) throw new Error(`Grafana datasources HTTP ${res.status}`);
    const list = (await res.json()) as Array<{ type?: string; uid?: string }>;
    return list.find((d) => d.type === "loki")?.uid ?? null;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.floor(v), max));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `docker compose logs --timestamps` lines look like:
 *   service-1  | 2026-06-10T12:34:56.789Z actual message
 */
function parseComposeLogs(raw: string): LogLine[] {
  const lines: LogLine[] = [];
  for (const row of raw.split("\n")) {
    if (!row.trim()) continue;
    const m = row.match(
      /^([\w.-]+?)(?:-\d+)?\s*\|\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)?\s?(.*)$/,
    );
    if (m) {
      lines.push({
        service: m[1] ?? null,
        ts: m[2] ?? null,
        line: m[3] ?? row,
      });
    } else {
      lines.push({ service: null, ts: null, line: row });
    }
  }
  // compose prints oldest-first; align with Loki's newest-first.
  return lines.reverse();
}

const ERROR_RE = /\b(error|err|fatal|panic|exception|traceback|unhandled|crash)\b/i;
const WARN_RE = /\b(warn|warning|deprecated|retry|retrying|timeout|timed out|slow)\b/i;

/**
 * Cluster lines by a normalized signature: numbers, uuids, hex ids and
 * quoted values collapse so "user 123 not found" and "user 456 not
 * found" count as one recurring problem, not two.
 */
function computeStats(lines: LogLine[]): LogStats {
  let errors = 0;
  let warns = 0;
  const clusters = new Map<string, LogCluster>();

  for (const l of lines) {
    const isError = ERROR_RE.test(l.line);
    const isWarn = !isError && WARN_RE.test(l.line);
    if (isError) errors++;
    if (isWarn) warns++;
    if (!isError && !isWarn) continue;

    const signature = normalize(l.line);
    const existing = clusters.get(signature);
    if (existing) {
      existing.count++;
    } else {
      clusters.set(signature, {
        signature,
        count: 1,
        level: isError ? "error" : "warn",
        sample: l.line.slice(0, 300),
      });
    }
  }

  return {
    total: lines.length,
    errors,
    warns,
    clusters: [...clusters.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
  };
}

function normalize(line: string): string {
  return line
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/\b[0-9a-f]{12,}\b/g, "<hex>")
    .replace(/\d+(\.\d+)?(ms|s|m)?\b/g, "<n>")
    .replace(/"[^"]*"/g, '"<v>"')
    .replace(/'[^']*'/g, "'<v>'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
