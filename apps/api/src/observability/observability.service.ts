import {
  Injectable,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { generateText } from "ai";
import { EnvironmentsService } from "../environments/environments.service";
import { IncidentsService, type IncidentFields } from "./incidents.service";
import { VmExecService } from "./vm-exec.service";
import { LogsService } from "./logs.service";
import { CloudWatchMetricsService } from "./cloudwatch-metrics.service";
import { anthropicModel, isLlmConfigured } from "../common/llm";

type Severity = "CRITICAL" | "WARNING" | "INFO";

interface Signal {
  fingerprint: string;
  source: "HEALTHCHECK" | "LOGS" | "METRICS";
  severity: Severity;
  title: string;
  detail: string;
}

/** An error cluster must recur this often in the window to page. */
const LOG_INCIDENT_MIN_COUNT = 3;
const LOG_WINDOW_MINUTES = 30;
const FATAL_RE = /\b(fatal|panic|out of memory|oom|segfault|unhandled)\b/i;

interface EnvLike {
  id: string;
  projectId: string;
  type: string;
  status: string;
  region: string | null;
  deployStrategy: string | null;
  awsRoleArn: string | null;
  heizenConfig: unknown;
  stackOutputs: unknown;
}

/**
 * Detects incidents on a deployed environment by gathering health signals
 * — HTTP reachability, per-service container health (EC2), infra metrics
 * (CloudWatch), and recurring app-log errors — then has the agent write a
 * suggested remedy for each. Signals that have cleared resolve their
 * incident automatically. The platform is its own detection engine: it
 * reasons from raw logs/metrics rather than ingesting another tool's alerts.
 */
@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(
    private readonly environments: EnvironmentsService,
    private readonly incidents: IncidentsService,
    private readonly vmExec: VmExecService,
    private readonly logsService: LogsService,
    private readonly cloudwatch: CloudWatchMetricsService,
  ) {}

  async scan(orgId: string, projectId: string, envId: string) {
    const env = (await this.environments.get(
      orgId,
      projectId,
      envId,
    )) as unknown as EnvLike;

    if (env.status !== "LIVE") {
      throw new BadRequestException(
        "Environment is not live — nothing to monitor yet.",
      );
    }

    const signals: Signal[] = [];

    // ── 1. HTTP reachability ────────────────────────────────────────
    const probe = deriveProbeUrl(env);
    if (probe) {
      const health = await httpProbe(probe.url);
      if (!health.ok) {
        signals.push({
          fingerprint: "http-unreachable",
          source: "HEALTHCHECK",
          severity: "CRITICAL",
          title: `App is not responding at ${probe.label}`,
          detail: health.detail,
        });
      } else {
        await this.incidents.resolveByFingerprint(envId, "http-unreachable");
      }
    }

    // ── 1b. Per-service container health (EC2 boxes, via SSM) ──────
    if (this.vmExec.canExec(env)) {
      try {
        const services = await this.vmExec.serviceStatus(env);
        for (const svc of services) {
          const fp = `service:${svc.name}`;
          const down =
            ["exited", "dead", "restarting", "paused"].includes(svc.state) ||
            svc.health === "unhealthy";
          if (down) {
            signals.push({
              fingerprint: fp,
              source: "HEALTHCHECK",
              severity: svc.state === "restarting" ? "WARNING" : "CRITICAL",
              title: `Service "${svc.name}" is ${svc.health === "unhealthy" ? "unhealthy" : svc.state}`,
              detail: `docker compose reports: ${svc.status || svc.state}`,
            });
          } else {
            await this.incidents.resolveByFingerprint(envId, fp);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Service-status check failed for env ${envId}: ${(err as Error).message}`,
        );
      }
    }

    // ── 2. Infra metrics (CloudWatch, via the customer role) ────────
    // Cheap, always-on detection: no on-box agent needed since EC2 emits
    // CPU/StatusCheck natively and the deploy role grants read access.
    if (this.cloudwatch.canQuery(env)) {
      const firingMetrics = new Set<string>();
      try {
        for (const m of await this.cloudwatch.collect(env)) {
          firingMetrics.add(m.fingerprint);
          signals.push({
            fingerprint: m.fingerprint,
            source: "METRICS",
            severity: m.severity,
            title: m.title,
            detail: m.detail,
          });
        }
        await this.incidents.resolveStaleBySource(envId, "METRICS", firingMetrics);
      } catch (err) {
        const message = (err as Error).message;
        // Permission/config errors are actionable misconfig (the deploy role
        // likely lacks CloudWatch read) — surface at error level. Everything
        // else is treated as transient so a flaky API call stays quiet.
        const misconfig =
          /AccessDenied|UnauthorizedOperation|InvalidClientTokenId|ValidationError|not authorized/i.test(
            message,
          );
        const note = `CloudWatch metrics check failed for env ${envId}: ${message}`;
        if (misconfig) this.logger.error(`${note} (check deploy-role CloudWatch permissions)`);
        else this.logger.warn(note);
      }
    }

    // ── 2b. Recurring app-log errors (Sentry-style grouping) ────────
    // The same normalized error signature always maps to the same
    // fingerprint, so a recurring error keeps ONE incident (occurrences
    // climbing) instead of paging fresh every sweep — and auto-resolves
    // once it stops appearing in the window.
    try {
      const logData = await this.logsService.fetch(orgId, projectId, envId, {
        minutes: LOG_WINDOW_MINUTES,
        limit: 1000,
      });
      const firingLogs = new Set<string>();
      for (const cluster of logData.stats.clusters) {
        if (cluster.level !== "error") continue;
        const isFatal = FATAL_RE.test(cluster.sample);
        if (cluster.count < LOG_INCIDENT_MIN_COUNT && !isFatal) continue;
        const fp = `log:${fingerprintOf(cluster.signature)}`;
        firingLogs.add(fp);
        signals.push({
          fingerprint: fp,
          source: "LOGS",
          severity: isFatal || cluster.count >= 20 ? "CRITICAL" : "WARNING",
          title: `Recurring app error (×${cluster.count} in ${LOG_WINDOW_MINUTES}m): ${cluster.sample.slice(0, 120)}`,
          detail:
            `Signature: ${cluster.signature}\n` +
            `Count in window: ${cluster.count} (${logData.source} logs)\n` +
            `Sample: ${cluster.sample}`,
        });
      }
      await this.incidents.resolveStaleBySource(envId, "LOGS", firingLogs);
    } catch (err) {
      // No log source configured is the common case — stay quiet-ish.
      this.logger.debug(
        `Log scan skipped for env ${envId}: ${(err as Error).message}`,
      );
    }

    // ── 3. Persist + agent-written remedies ─────────────────────────
    for (const sig of signals) {
      // Only pay for a remedy when the incident is new (or reopening /
      // missing one) — a standing failure swept every few minutes must
      // not turn into an LLM call per sweep.
      const existing = await this.incidents.findByFingerprint(
        envId,
        sig.fingerprint,
      );
      const needsRemedy =
        isLlmConfigured() &&
        (!existing ||
          existing.status === "RESOLVED" ||
          !existing.suggestedRemedy);
      const suggestedRemedy = needsRemedy
        ? await this.suggestRemedy(env, sig).catch(() => null)
        : null;
      const fields: IncidentFields = {
        severity: sig.severity,
        source: sig.source,
        title: sig.title,
        detail: sig.detail,
        suggestedRemedy,
      };
      await this.incidents.upsertByFingerprint(envId, sig.fingerprint, fields);
    }

    await this.incidents.broadcast(orgId, envId);
    return this.incidents.list(orgId, projectId, envId);
  }

  /** Ask the agent for a concise, actionable remedy for one signal. */
  private async suggestRemedy(env: EnvLike, sig: Signal): Promise<string | null> {
    const strategy =
      env.deployStrategy ?? (env.type === "PRODUCTION" ? "ECS" : "LIGHTSAIL");
    const { text } = await generateText({
      model: anthropicModel(),
      system:
        "You are an SRE assistant. Given one incident signal on a deployed " +
        "environment, reply with a SHORT remediation (2-4 sentences or a few " +
        "bullet steps). Be concrete and reference the actual stack. Do not " +
        "restate the problem; jump to what to check/do. No preamble.",
      prompt:
        `Deploy strategy: ${strategy}. AWS region: ${env.region ?? "unknown"}.\n` +
        `Signal source: ${sig.source}. Severity: ${sig.severity}.\n` +
        `Title: ${sig.title}\nDetail: ${sig.detail}\n\n` +
        `Stack outputs: ${safeJson(env.stackOutputs)}\n` +
        `Suggest a remedy.`,
    });
    return text.trim() || null;
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}).slice(0, 1500);
  } catch {
    return "{}";
  }
}

/** Short stable hash (FNV-1a) of a normalized error signature. */
function fingerprintOf(signature: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Where to probe for "is the app up": ALB DNS (ECS), a routing domain, or the box IP. */
function deriveProbeUrl(env: EnvLike): { url: string; label: string } | null {
  const outputs = (env.stackOutputs ?? {}) as Record<string, unknown>;
  const alb = typeof outputs.albDnsName === "string" ? outputs.albDnsName : null;
  if (alb) return { url: `http://${alb}`, label: alb };

  const cfg = (env.heizenConfig ?? {}) as {
    routing?: Record<string, { domain?: string }>;
  };
  const firstDomain = Object.values(cfg.routing ?? {})
    .map((r) => r?.domain)
    .find((d) => typeof d === "string" && d.trim().length > 0);
  if (firstDomain) return { url: `https://${firstDomain}`, label: firstDomain };

  const ip =
    typeof outputs.staticIpAddress === "string"
      ? outputs.staticIpAddress
      : typeof outputs.publicIp === "string"
        ? outputs.publicIp
        : null;
  if (ip) return { url: `http://${ip}`, label: ip };

  return null;
}

async function httpProbe(
  url: string,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    // Any response < 500 means the server is up and routing (4xx like
    // 401/404 still proves the box + proxy are alive).
    if (res.status < 500) {
      return { ok: true, detail: `HTTP ${res.status}` };
    }
    return { ok: false, detail: `HTTP ${res.status} from ${url}` };
  } catch (err) {
    const msg = (err as Error).name === "AbortError" ? "timed out after 8s" : (err as Error).message;
    return { ok: false, detail: `Request to ${url} ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
