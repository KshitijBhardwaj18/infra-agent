import { Injectable } from "@nestjs/common";
import { EnvironmentsService } from "../environments/environments.service";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { VmExecService } from "./vm-exec.service";
import { CloudWatchMetricsService } from "./cloudwatch-metrics.service";
import { env as readEnv } from "../common/env";

interface SourcesEnvLike {
  id: string;
  projectId: string;
  type: string;
  deployStrategy: string | null;
  region: string | null;
  awsRoleArn: string | null;
  pulumiStackName: string | null;
  stackOutputs: unknown;
}

interface SourceInfo {
  provider: string;
  label: string;
  active: boolean;
  note?: string;
}

export interface SourcesResponse {
  logs: SourceInfo;
  metrics: SourceInfo;
}

/**
 * Reports which observability sources are actually feeding an environment —
 * the *resolved* providers (what the platform would read from right now),
 * not a fetch. Mirrors the exact resolution order used by the logs layer
 * and the CloudWatch metrics check, so the UI shows the truth.
 */
@Injectable()
export class SourcesService {
  constructor(
    private readonly environments: EnvironmentsService,
    private readonly dataSources: DataSourcesService,
    private readonly vmExec: VmExecService,
    private readonly cloudwatch: CloudWatchMetricsService,
  ) {}

  async describe(
    orgId: string,
    projectId: string,
    envId: string,
  ): Promise<SourcesResponse> {
    // get() does findFirst with no select, so the full row is returned —
    // pulumiStackName is present (possibly null for a never-deployed env,
    // which the ECS check below treats correctly as "no CloudWatch logs").
    const env = (await this.environments.get(
      orgId,
      projectId,
      envId,
    )) as unknown as SourcesEnvLike;
    return {
      logs: await this.describeLogs(env),
      metrics: this.describeMetrics(env),
    };
  }

  // Same priority the logs layer uses: per-env Loki → global Loki env →
  // CloudWatch (ECS) → on-box SSM (EC2) → none.
  private async describeLogs(env: SourcesEnvLike): Promise<SourceInfo> {
    const hasLoki =
      (await this.dataSources.getDecryptedConfig(env.id, "grafana-loki")) !==
      null;
    if (hasLoki) {
      return { provider: "grafana-loki", label: "Grafana Loki", active: true };
    }
    if (readEnv("GRAFANA_URL") && readEnv("GRAFANA_TOKEN")) {
      return {
        provider: "grafana-loki",
        label: "Grafana Loki (platform)",
        active: true,
      };
    }
    if (
      env.deployStrategy === "ECS" &&
      env.awsRoleArn &&
      env.region &&
      env.pulumiStackName
    ) {
      return { provider: "cloudwatch", label: "CloudWatch Logs", active: true };
    }
    if (this.vmExec.canExec(env)) {
      return { provider: "on-box", label: "On-box (SSM)", active: true };
    }
    return {
      provider: "none",
      label: "None",
      active: false,
      note: "Connect a Grafana/Loki source, or deploy on EC2/ECS.",
    };
  }

  private describeMetrics(env: SourcesEnvLike): SourceInfo {
    if (this.cloudwatch.canQuery(env)) {
      return { provider: "cloudwatch", label: "CloudWatch", active: true };
    }
    return { provider: "none", label: "None", active: false };
  }
}
