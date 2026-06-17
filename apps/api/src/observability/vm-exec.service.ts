import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { assumeCustomerRole, runSsmCommand } from "@heizen/infra-core";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";

export interface ComposeServiceStatus {
  name: string;
  /** docker compose state: running | exited | restarting | paused | dead */
  state: string;
  /** Human status line, e.g. "Up 2 hours (healthy)". */
  status: string;
  /** Container healthcheck verdict when one is defined. */
  health: string | null;
}

interface VmEnv {
  id: string;
  projectId: string;
  type: string;
  region: string | null;
  deployStrategy: string | null;
  awsRoleArn: string | null;
  stackOutputs: unknown;
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
// Compose service names: letters, digits, dot, dash, underscore. Guarded
// because the name is interpolated into a shell command run via SSM.
const SAFE_SERVICE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Runs read/operate commands on an EC2_COMPOSE box over SSM RunCommand —
 * the same channel in-place deploys use, so no new access path. Only
 * EC2_COMPOSE environments qualify (Lightsail boxes aren't SSM-managed).
 */
@Injectable()
export class VmExecService {
  private readonly logger = new Logger(VmExecService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** EC2 box reachable over SSM? (strategy + instanceId + role present) */
  canExec(env: VmEnv): boolean {
    return (
      env.deployStrategy === "EC2_COMPOSE" &&
      !!this.instanceIdOf(env) &&
      !!env.awsRoleArn &&
      !!env.region
    );
  }

  /** Per-service container state via `docker compose ps` on the box. */
  async serviceStatus(env: VmEnv): Promise<ComposeServiceStatus[]> {
    const { appDir, compose } = await this.composeContext(env);
    const out = await this.run(env, [
      `cd ${appDir}`,
      `${compose} ps --all --format json`,
    ]);
    return parseComposePs(out);
  }

  /**
   * Tail app logs from the box. SSM caps captured stdout at ~24KB, so
   * the tail is deliberately modest — Loki is the high-volume path;
   * this is the zero-setup fallback.
   */
  async logs(
    env: VmEnv,
    opts: { service?: string; sinceMinutes?: number; tail?: number } = {},
  ): Promise<string> {
    const { service, sinceMinutes = 30, tail = 300 } = opts;
    if (service && !SAFE_SERVICE.test(service)) {
      throw new BadRequestException(`Invalid service name "${service}"`);
    }
    const minutes = Math.max(1, Math.min(Math.floor(sinceMinutes), 24 * 60));
    const lines = Math.max(10, Math.min(Math.floor(tail), 500));
    const { appDir, compose } = await this.composeContext(env);
    return this.run(env, [
      `cd ${appDir}`,
      `${compose} logs --no-color --timestamps --since ${minutes}m --tail ${lines}${service ? ` ${service}` : ""} 2>&1 | tail -c 23000`,
    ]);
  }

  /** Restart one compose service in place (no re-deploy). */
  async restartService(env: VmEnv, service: string): Promise<string> {
    if (!SAFE_SERVICE.test(service)) {
      throw new BadRequestException(`Invalid service name "${service}"`);
    }
    const { appDir, compose } = await this.composeContext(env);
    const out = await this.run(
      env,
      [
        `cd ${appDir}`,
        `${compose} restart ${service}`,
        `${compose} ps ${service} --format json`,
      ],
      180_000,
    );
    const after = parseComposePs(out).find((s) => s.name.includes(service));
    return after
      ? `${service}: ${after.status}`
      : `${service} restarted (no status reported)`;
  }

  private instanceIdOf(env: VmEnv): string | null {
    const outputs = (env.stackOutputs ?? {}) as Record<string, unknown>;
    return typeof outputs.instanceId === "string" ? outputs.instanceId : null;
  }

  private async composeContext(env: VmEnv) {
    if (!this.canExec(env)) {
      throw new BadRequestException(
        "This environment doesn't support on-box commands (EC2 deploys only).",
      );
    }
    const project = await this.prisma.project.findUnique({
      where: { id: env.projectId },
      select: { slug: true },
    });
    if (!project || !SAFE_SLUG.test(project.slug)) {
      throw new BadRequestException("Project slug is not shell-safe.");
    }
    return {
      appDir: `/home/ubuntu/${project.slug}`,
      // Same invocation the deploy path uses — both compose files + .env.
      compose: `docker compose -f docker-compose.yml -f docker-compose.caddy.yml --env-file .env`,
    };
  }

  private async run(
    env: VmEnv,
    commands: string[],
    timeoutMs = 60_000,
  ): Promise<string> {
    const awsCreds = await assumeCustomerRole(
      env.awsRoleArn!,
      env.id,
      env.region!,
    );
    let captured = "";
    await runSsmCommand({
      instanceId: this.instanceIdOf(env)!,
      awsCreds,
      commands: ["set -e", ...commands],
      timeoutMs,
      onOutput: (line) => {
        // Skip the [ssm] progress ticks; keep real stdout.
        if (!line.startsWith("[ssm]")) captured += line;
      },
    });
    return captured;
  }
}

/**
 * `docker compose ps --format json` emits one JSON object per line in
 * compose v2 (and a JSON array in some builds) — accept both.
 */
function parseComposePs(raw: string): ComposeServiceStatus[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let rows: Array<Record<string, unknown>> = [];
  if (trimmed.startsWith("[")) {
    try {
      rows = JSON.parse(trimmed) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  } else {
    for (const line of trimmed.split("\n")) {
      const l = line.trim();
      if (!l.startsWith("{")) continue;
      try {
        rows.push(JSON.parse(l) as Record<string, unknown>);
      } catch {
        // ignore non-JSON noise interleaved in stdout
      }
    }
  }
  return rows.map((r) => ({
    name: str(r.Service) ?? str(r.Name) ?? "unknown",
    state: (str(r.State) ?? "unknown").toLowerCase(),
    status: str(r.Status) ?? "",
    health: str(r.Health) || null,
  }));
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
