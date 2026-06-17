import { Injectable, Logger } from "@nestjs/common";
import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import { assumeCustomerRole } from "@heizen/infra-core";

type Severity = "CRITICAL" | "WARNING" | "INFO";

export interface MetricSignal {
  fingerprint: string;
  severity: Severity;
  title: string;
  detail: string;
}

interface EnvLike {
  id: string;
  deployStrategy: string | null;
  region: string | null;
  awsRoleArn: string | null;
  stackOutputs: unknown;
}

/** A declarative metric threshold check — the source extends by appending. */
interface MetricCheck {
  id: string;
  namespace: string;
  metricName: string;
  stat: "Average" | "Maximum" | "Minimum" | "Sum";
  dimensions: { Name: string; Value: string }[];
  threshold: number;
  comparison: "above" | "below";
  severity: Severity;
  label: string;
  unit?: string;
  /** Title used when breached; falls back to a generated one. */
  breachTitle?: string;
}

/** Sustained average CPU above this pages a warning. */
const CPU_WARN_PCT = 90;
/** Sustained average memory above this pages a warning. */
const MEM_WARN_PCT = 90;
/** RDS free storage below this (bytes ≈ 2 GB) is critical. */
const RDS_LOW_STORAGE_BYTES = 2_000_000_000;
/** Look back this far; newest datapoint decides the current state. */
const WINDOW_MINUTES = 15;
const PERIOD_SECONDS = 300;

/**
 * Reads infra metrics from CloudWatch with the customer's assumed role and
 * turns threshold breaches into incident signals. Metrics are the cheap,
 * always-on detection layer: no on-box agent or log shipping is required
 * because EC2 emits CPU/StatusCheck to CloudWatch natively and the deploy
 * role already grants cross-account read access.
 *
 * Checks are declarative (see buildChecks) so later strategies — ECS, ALB,
 * RDS — extend the list without touching the query/evaluate flow.
 */
@Injectable()
export class CloudWatchMetricsService {
  private readonly logger = new Logger(CloudWatchMetricsService.name);

  /** True when we have a role, region, and at least one check to run. */
  canQuery(env: EnvLike): boolean {
    return Boolean(env.awsRoleArn && env.region && this.buildChecks(env).length);
  }

  async collect(env: EnvLike): Promise<MetricSignal[]> {
    const checks = this.buildChecks(env);
    if (!env.awsRoleArn || !env.region || checks.length === 0) return [];

    const creds = await assumeCustomerRole(env.awsRoleArn, env.id, env.region);
    const client = new CloudWatchClient({
      region: env.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });

    // Wrap from client creation so the client is always destroyed, even if
    // the query throws. (assumeCustomerRole is above: if it throws, no
    // client exists yet, so there's nothing to leak.)
    try {
      const end = new Date();
      const start = new Date(end.getTime() - WINDOW_MINUTES * 60 * 1000);
      const queries: MetricDataQuery[] = checks.map((c, i) => ({
        Id: `m${i}`,
        MetricStat: {
          Metric: {
            Namespace: c.namespace,
            MetricName: c.metricName,
            Dimensions: c.dimensions,
          },
          Period: PERIOD_SECONDS,
          Stat: c.stat,
        },
        ReturnData: true,
      }));

      const res = await client.send(
        new GetMetricDataCommand({
          StartTime: start,
          EndTime: end,
          // Newest datapoint first so Values[0] is the current state.
          ScanBy: "TimestampDescending",
          MetricDataQueries: queries,
        }),
      );
      const results = res.MetricDataResults ?? [];

      const signals: MetricSignal[] = [];
      results.forEach((result, i) => {
        const check = checks[i];
        // Guard against a response that doesn't line up with our queries.
        if (!result || !check) return;
        // No datapoint → we can't assert a breach; skip rather than page a
        // false "metric missing" incident.
        const value = result.Values?.[0];
        if (value === undefined) return;

        const breached =
          check.comparison === "above"
            ? value >= check.threshold
            : value <= check.threshold;
        if (!breached) return;

        const shown = `${Math.round(value * 100) / 100}${check.unit ?? ""}`;
        signals.push({
          fingerprint: `metric:${check.id}`,
          severity: check.severity,
          title:
            check.breachTitle ??
            `${check.label} ${check.comparison === "above" ? "high" : "low"} (${shown})`,
          detail:
            `${check.namespace} ${check.metricName} ${check.stat} = ${shown} ` +
            `over the last ${PERIOD_SECONDS / 60}m ` +
            `(threshold ${check.comparison} ${check.threshold}${check.unit ?? ""}).`,
        });
      });
      return signals;
    } finally {
      client.destroy();
    }
  }

  /**
   * Metric checks for this env, derived from existing stack outputs:
   * EC2 native CPU/StatusCheck, ECS per-service CPU/memory, and RDS
   * CPU/free-storage. No CloudWatch agent or extra stack outputs needed.
   * ALB request/latency metrics need the LB ARN suffix exported first.
   */
  private buildChecks(env: EnvLike): MetricCheck[] {
    const outputs = (env.stackOutputs ?? {}) as Record<string, unknown>;
    // Validate shape before it reaches a CloudWatch dimension — EC2 ids are
    // `i-` + 8 or 17 hex chars. A malformed value just means "no check".
    const rawInstanceId = outputs.instanceId;
    const instanceId =
      typeof rawInstanceId === "string" && /^i-[0-9a-f]{8,17}$/.test(rawInstanceId)
        ? rawInstanceId
        : null;

    const checks: MetricCheck[] = [];
    if (env.deployStrategy === "EC2_COMPOSE" && instanceId) {
      checks.push({
        id: "ec2-cpu",
        namespace: "AWS/EC2",
        metricName: "CPUUtilization",
        stat: "Average",
        dimensions: [{ Name: "InstanceId", Value: instanceId }],
        threshold: CPU_WARN_PCT,
        comparison: "above",
        severity: "WARNING",
        label: "EC2 CPU",
        unit: "%",
      });
      checks.push({
        id: "ec2-status-check",
        namespace: "AWS/EC2",
        metricName: "StatusCheckFailed",
        stat: "Maximum",
        dimensions: [{ Name: "InstanceId", Value: instanceId }],
        threshold: 1,
        comparison: "above",
        severity: "CRITICAL",
        label: "EC2 status check",
        breachTitle: "EC2 instance status check failing",
      });
    }

    // ── ECS service CPU/memory (AWS/ECS — emitted per service without
    // Container Insights). One check per *ServiceName stack output. ──
    if (env.deployStrategy === "ECS") {
      const clusterName =
        typeof outputs.clusterName === "string" ? outputs.clusterName : null;
      if (clusterName) {
        for (const [key, value] of Object.entries(outputs)) {
          if (!key.endsWith("ServiceName") || typeof value !== "string" || !value) {
            continue;
          }
          // Service name goes into the fingerprint (metric:ecs-cpu-<name>),
          // so keep it to stable, safe chars; skip anything unexpected.
          if (!/^[A-Za-z0-9_-]+$/.test(value)) {
            this.logger.warn(`Skipping ECS service with unexpected name "${value}"`);
            continue;
          }
          const dims = [
            { Name: "ClusterName", Value: clusterName },
            { Name: "ServiceName", Value: value },
          ];
          checks.push({
            id: `ecs-cpu-${value}`,
            namespace: "AWS/ECS",
            metricName: "CPUUtilization",
            stat: "Average",
            dimensions: dims,
            threshold: CPU_WARN_PCT,
            comparison: "above",
            severity: "WARNING",
            label: `ECS ${value} CPU`,
            unit: "%",
          });
          checks.push({
            id: `ecs-mem-${value}`,
            namespace: "AWS/ECS",
            metricName: "MemoryUtilization",
            stat: "Average",
            dimensions: dims,
            threshold: MEM_WARN_PCT,
            comparison: "above",
            severity: "WARNING",
            label: `ECS ${value} memory`,
            unit: "%",
          });
        }
      }
    }

    // ── RDS CPU + free storage. The instance identifier is the leading
    // segment of the endpoint host (<id>.<hash>.<region>.rds.amazonaws.com),
    // so we derive it rather than needing a new stack output. ──
    const dbEndpoint =
      typeof outputs.dbEndpoint === "string" ? outputs.dbEndpoint : null;
    const dbId = dbEndpoint ? dbEndpoint.split(".")[0] : null;
    if (dbId && /^[A-Za-z][A-Za-z0-9-]{0,62}$/.test(dbId)) {
      const dims = [{ Name: "DBInstanceIdentifier", Value: dbId }];
      checks.push({
        id: "rds-cpu",
        namespace: "AWS/RDS",
        metricName: "CPUUtilization",
        stat: "Average",
        dimensions: dims,
        threshold: CPU_WARN_PCT,
        comparison: "above",
        severity: "WARNING",
        label: "RDS CPU",
        unit: "%",
      });
      checks.push({
        id: "rds-free-storage",
        namespace: "AWS/RDS",
        metricName: "FreeStorageSpace",
        stat: "Average",
        dimensions: dims,
        threshold: RDS_LOW_STORAGE_BYTES,
        comparison: "below",
        severity: "CRITICAL",
        label: "RDS free storage",
        breachTitle: "RDS free storage critically low",
      });
    }
    return checks;
  }
}
