"use client";

import type { HeizenConfig, DeployStrategy } from "@heizen/shared";
import {
  DB_PRESETS,
  CACHE_PRESETS,
  NAT_COSTS,
  ALB_MONTHLY_COST,
  STORAGE_MONTHLY_COST,
  LIGHTSAIL_BUNDLE_PRESETS,
  EC2_INSTANCE_PRESETS,
  EC2_EBS_MONTHLY_COST,
  estimateFargateMonthlyCost,
} from "@heizen/shared/presets";

const fmtCost = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCost(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return fmtCost.format(value);
}

function dbCost(config: HeizenConfig): number {
  if (config.database.engine !== "postgres" || !config.database.size) return 0;
  const base = DB_PRESETS[config.database.size].monthlyCost;
  return config.database.multiAz ? base * 2 : base;
}

/**
 * Monthly cost estimate. The compute model differs per deploy strategy:
 *   ECS         — Fargate task(s) + ALB + NAT + ElastiCache + RDS + S3
 *   EC2_COMPOSE — one EC2 box + EBS (+ RDS/S3 if enabled); redis is in
 *                 the box's compose, no ALB/NAT/Fargate
 *   LIGHTSAIL   — just the Lightsail bundle (postgres/redis run on-box)
 *
 * deployStrategy is optional; when absent we infer from the env (staging
 * → Lightsail) and otherwise fall back to the ECS model.
 */
export function CostEstimator({
  config,
  deployStrategy,
  ec2InstanceType,
}: {
  config: HeizenConfig;
  deployStrategy?: DeployStrategy;
  ec2InstanceType?: string;
}) {
  const strategy: DeployStrategy =
    deployStrategy ?? (config.env === "staging" ? "LIGHTSAIL" : "ECS");

  let total = 0;

  if (strategy === "EC2_COMPOSE") {
    const inst = EC2_INSTANCE_PRESETS[ec2InstanceType ?? "t3.medium"];
    total += (inst?.monthlyCost ?? EC2_INSTANCE_PRESETS["t3.medium"]!.monthlyCost);
    total += EC2_EBS_MONTHLY_COST;
    total += dbCost(config); // managed RDS, if enabled
    if (config.storage.enabled) total += STORAGE_MONTHLY_COST;
    // No Fargate/ALB/NAT/ElastiCache — redis (if any) runs in the box's compose.
  } else if (strategy === "LIGHTSAIL") {
    const bundle = config.lightsailBundle ?? "small";
    total += LIGHTSAIL_BUNDLE_PRESETS[bundle].monthlyCost;
    // Everything (postgres/redis/caddy) runs in the bundle's RAM — no
    // separate managed-service charges.
  } else {
    for (const service of config.services) {
      total +=
        estimateFargateMonthlyCost(service.cpu, service.memory) *
        service.scaling.min;
    }
    total += dbCost(config);
    if (config.cache.engine === "redis" && config.cache.size) {
      total += CACHE_PRESETS[config.cache.size].monthlyCost;
    }
    total += NAT_COSTS[config.networking.nat];
    if (config.loadBalancer.enabled) total += ALB_MONTHLY_COST;
    if (config.storage.enabled) total += STORAGE_MONTHLY_COST;
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Estimated monthly cost</span>
        <span className="tabular-nums text-lg font-semibold">{formatCost(total)}/mo</span>
      </div>
    </div>
  );
}
