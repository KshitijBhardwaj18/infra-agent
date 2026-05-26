import type { CacheSize, DbSize, NatMode } from "./heizen-config";

export interface DbPreset {
  instanceClass: string;
  label: string;
  monthlyCost: number;
}

export interface CachePreset {
  nodeType: string;
  label: string;
  monthlyCost: number;
}

export const DB_PRESETS: Record<DbSize, DbPreset> = {
  micro: { instanceClass: "db.t4g.micro", label: "2 vCPU / 1 GB", monthlyCost: 15 },
  small: { instanceClass: "db.t4g.small", label: "2 vCPU / 2 GB", monthlyCost: 30 },
  medium: { instanceClass: "db.t4g.medium", label: "2 vCPU / 4 GB", monthlyCost: 60 },
  large: { instanceClass: "db.t4g.large", label: "2 vCPU / 8 GB", monthlyCost: 120 },
};

export const CACHE_PRESETS: Record<CacheSize, CachePreset> = {
  micro: { nodeType: "cache.t4g.micro", label: "0.5 GB", monthlyCost: 13 },
  small: { nodeType: "cache.t4g.small", label: "1.5 GB", monthlyCost: 26 },
  medium: { nodeType: "cache.t4g.medium", label: "3 GB", monthlyCost: 48 },
};

export const NAT_COSTS: Record<NatMode, number> = {
  none: 0,
  single: 35,
  dual: 70,
};

export const ALB_MONTHLY_COST = 18;
export const STORAGE_MONTHLY_COST = 3;

/** Rough monthly Fargate cost estimate from CPU units and memory MB. */
export function estimateFargateMonthlyCost(cpu: number, memory: number): number {
  const vcpu = cpu / 1024;
  const gb = memory / 1024;
  return Math.round(vcpu * 30 + gb * 3);
}
