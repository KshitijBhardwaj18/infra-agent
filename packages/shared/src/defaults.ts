import type { EnvType, HeizenConfig } from "./heizen-config";

export interface EnvDefaults {
  networking: {
    nat: "none" | "single" | "dual";
    vpcCidr: string;
  };
  database: {
    size: "micro" | "small" | "medium" | "large";
    multiAz: boolean;
    deletionProtection: boolean;
    backupRetentionDays: number;
  };
  cache: {
    size: "micro" | "small" | "medium";
  };
  service: {
    cpu: "small" | "medium" | "large";
    scaling: { min: number; max: number; cpuTarget: number };
  };
}

export const STAGING_DEFAULTS: EnvDefaults = {
  networking: { nat: "none", vpcCidr: "10.0.0.0/16" },
  database: {
    size: "micro",
    multiAz: false,
    deletionProtection: false,
    backupRetentionDays: 1,
  },
  cache: { size: "micro" },
  service: {
    cpu: "small",
    scaling: { min: 1, max: 2, cpuTarget: 70 },
  },
};

export const PRODUCTION_DEFAULTS: EnvDefaults = {
  networking: { nat: "dual", vpcCidr: "10.0.0.0/16" },
  database: {
    size: "small",
    multiAz: true,
    deletionProtection: true,
    backupRetentionDays: 14,
  },
  cache: { size: "small" },
  service: {
    cpu: "medium",
    scaling: { min: 2, max: 6, cpuTarget: 60 },
  },
};

export function getDefaults(env: EnvType): EnvDefaults {
  return env === "production" ? PRODUCTION_DEFAULTS : STAGING_DEFAULTS;
}

/**
 * Apply env-type defaults to a freshly-analyzed HeizenConfig. Existing values
 * always win; defaults only fill gaps.
 */
export function applyDefaults(cfg: HeizenConfig): HeizenConfig {
  const d = getDefaults(cfg.env);
  return {
    ...cfg,
    networking: {
      nat: cfg.networking.nat ?? d.networking.nat,
      vpcCidr: cfg.networking.vpcCidr ?? d.networking.vpcCidr,
    },
    database:
      cfg.database.engine === "postgres"
        ? {
            ...cfg.database,
            size: cfg.database.size ?? d.database.size,
            multiAz: cfg.database.multiAz ?? d.database.multiAz,
            deletionProtection:
              cfg.database.deletionProtection ?? d.database.deletionProtection,
            backupRetentionDays:
              cfg.database.backupRetentionDays ?? d.database.backupRetentionDays,
          }
        : cfg.database,
    cache:
      cfg.cache.engine === "redis"
        ? { ...cfg.cache, size: cfg.cache.size ?? d.cache.size }
        : cfg.cache,
    services: cfg.services.map((s) => ({
      ...s,
      cpu: s.cpu ?? d.service.cpu,
      scaling: s.scaling ?? d.service.scaling,
    })),
  };
}
