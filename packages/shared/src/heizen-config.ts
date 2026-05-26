import { z } from "zod";

export type DbSize = "micro" | "small" | "medium" | "large";
export type CacheSize = "micro" | "small" | "medium";
export type NatMode = "none" | "single" | "dual";
export type ServiceType = "backend" | "frontend" | "worker";
export type EnvType = "staging" | "production";

/** Valid Fargate CPU/memory combinations. Memory in MB. */
export const FARGATE_CPU_OPTIONS = [
  { cpu: 256, label: "0.25 vCPU", memoryOptions: [512, 1024, 2048] },
  { cpu: 512, label: "0.5 vCPU", memoryOptions: [1024, 2048, 3072, 4096] },
  { cpu: 1024, label: "1 vCPU", memoryOptions: [2048, 3072, 4096, 5120, 6144, 7168, 8192] },
  { cpu: 2048, label: "2 vCPU", memoryOptions: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384] },
  { cpu: 4096, label: "4 vCPU", memoryOptions: [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720] },
] as const;

export function formatMemoryMb(mb: number): string {
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`;
}

export interface ServiceConfig {
  name: string;
  type: ServiceType;
  port?: number;
  domain?: string;
  cpu: number;
  memory: number;
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

export const STAGING_SERVICE_DEFAULTS = { cpu: 256, memory: 512 } as const;
export const PRODUCTION_SERVICE_DEFAULTS = { cpu: 512, memory: 1024 } as const;

// ───────────────────────── zod schemas ─────────────────────────

export const serviceConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["backend", "frontend", "worker"]),
  port: z.number().int().positive().optional(),
  domain: z.string().optional(),
  cpu: z.number().int().positive(),
  memory: z.number().int().positive(),
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

export const analyzerResultSchema = z.object({
  config: heizenConfigSchema,
});

export type AnalyzerResult = z.infer<typeof analyzerResultSchema>;
