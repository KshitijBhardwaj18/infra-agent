import { z } from "zod";

export type CpuSize = "small" | "medium" | "large";
export type DbSize = "micro" | "small" | "medium" | "large";
export type CacheSize = "micro" | "small" | "medium";
export type NatMode = "none" | "single" | "dual";
export type ServiceType = "backend" | "frontend" | "worker";
export type EnvType = "staging" | "production";

export interface ServiceConfig {
  name: string;
  type: ServiceType;
  port?: number;
  domain?: string;
  cpu: CpuSize;
  scaling: { min: number; max: number; cpuTarget: number };
  command: string;
  healthCheck?: { path: string; codes: string };
  inheritEnvFrom?: string;
}

export interface HeizenConfig {
  version: 1;
  project: string;
  env: EnvType;
  region: string;
  domain?: string;
  dockerfilePath?: string;
  ecr: { image: string; tag: string };
  networking: {
    nat: NatMode;
    vpcCidr?: string;
  };
  loadBalancer: { enabled: boolean };
  services: ServiceConfig[];
  database: {
    engine: "none" | "postgres";
    size?: DbSize;
    multiAz?: boolean;
    deletionProtection?: boolean;
    backupRetentionDays?: number;
    dbName?: string;
  };
  cache: {
    engine: "none" | "redis";
    size?: CacheSize;
  };
  storage: { enabled: boolean };
}

/**
 * Per-service env var maps. Used by the generator to produce Pulumi config
 * secrets and ECS container environment entries.
 *
 *   env.shared       — env vars applied to all backend / worker services
 *   env[serviceName] — env vars specific to one service
 */
export interface HeizenEnvConfig {
  env: Record<string, Record<string, string>>;
}

// ───────────────────────── zod schemas (LLM analyzer) ─────────────────────────

export const serviceConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["backend", "frontend", "worker"]),
  port: z.number().int().positive().optional(),
  domain: z.string().optional(),
  cpu: z.enum(["small", "medium", "large"]),
  scaling: z.object({
    min: z.number().int().min(0),
    max: z.number().int().min(1),
    cpuTarget: z.number().int().min(1).max(100),
  }),
  command: z.string().min(1),
  healthCheck: z
    .object({
      path: z.string(),
      codes: z.string(),
    })
    .optional(),
  inheritEnvFrom: z.string().optional(),
});

export const heizenConfigSchema = z.object({
  version: z.literal(1),
  project: z.string().min(1),
  env: z.enum(["staging", "production"]),
  region: z.string().min(1),
  domain: z.string().optional(),
  dockerfilePath: z.string().optional(),
  ecr: z.object({
    image: z.string(),
    tag: z.string(),
  }),
  networking: z.object({
    nat: z.enum(["none", "single", "dual"]),
    vpcCidr: z.string().optional(),
  }),
  loadBalancer: z.object({ enabled: z.boolean() }),
  services: z.array(serviceConfigSchema).min(1),
  database: z.object({
    engine: z.enum(["none", "postgres"]),
    size: z.enum(["micro", "small", "medium", "large"]).optional(),
    multiAz: z.boolean().optional(),
    deletionProtection: z.boolean().optional(),
    backupRetentionDays: z.number().int().optional(),
    dbName: z.string().optional(),
  }),
  cache: z.object({
    engine: z.enum(["none", "redis"]),
    size: z.enum(["micro", "small", "medium"]).optional(),
  }),
  storage: z.object({ enabled: z.boolean() }),
});

/**
 * Schema returned by the analyzer LLM. It tags each detected env var so the
 * platform can show users which ones it will auto-generate and which they
 * must provide.
 */
export const analyzerEnvVarSchema = z.object({
  service: z.string(),
  key: z.string(),
  classification: z.enum(["auto_generated", "needs_user_input"]),
  description: z.string().optional(),
});

export const analyzerResultSchema = z.object({
  config: heizenConfigSchema,
  envVars: z.array(analyzerEnvVarSchema),
});

export type AnalyzerEnvVar = z.infer<typeof analyzerEnvVarSchema>;
export type AnalyzerResult = z.infer<typeof analyzerResultSchema>;
