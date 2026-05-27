"use client";

import type { HeizenConfig } from "@heizen/shared";
import {
  DB_PRESETS,
  CACHE_PRESETS,
  NAT_COSTS,
  ALB_MONTHLY_COST,
  STORAGE_MONTHLY_COST,
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

export function CostEstimator({ config }: { config: HeizenConfig }) {
  let total = 0;

  for (const service of config.services) {
    total += estimateFargateMonthlyCost(service.cpu, service.memory) * service.scaling.min;
  }

  if (config.database.engine === "postgres" && config.database.size) {
    total += DB_PRESETS[config.database.size].monthlyCost;
    if (config.database.multiAz) total += DB_PRESETS[config.database.size].monthlyCost;
  }

  if (config.cache.engine === "redis" && config.cache.size) {
    total += CACHE_PRESETS[config.cache.size].monthlyCost;
  }

  total += NAT_COSTS[config.networking.nat];
  if (config.loadBalancer.enabled) total += ALB_MONTHLY_COST;
  if (config.storage.enabled) total += STORAGE_MONTHLY_COST;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Estimated monthly cost</span>
        <span className="tabular-nums text-lg font-semibold">{formatCost(total)}/mo</span>
      </div>
    </div>
  );
}
