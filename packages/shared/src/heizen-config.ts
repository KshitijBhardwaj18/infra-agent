import { z } from "zod";
import { isAwsRegion, isValidCidr } from "./presets";

export type DbSize = "micro" | "small" | "medium" | "large";
export type CacheSize = "micro" | "small" | "medium";
export type NatMode = "none" | "single" | "dual";
export type ServiceType = "backend" | "frontend" | "worker";
export type EnvType = "staging" | "production";

/**
 * Deploy paradigm for an environment (authoritative on the Environment
 * row, not in HeizenConfig). Null/absent means infer from env type:
 * PRODUCTION→ECS, STAGING→LIGHTSAIL.
 */
export const deployStrategySchema = z.enum([
  "ECS",
  "EC2_COMPOSE",
  "LIGHTSAIL",
]);
export type DeployStrategy = z.infer<typeof deployStrategySchema>;

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
  // Lightsail (staging) only — see zod schema below.
  lightsailBundle?: "nano" | "micro" | "small" | "medium" | "large";
  routing?: Record<string, { domain: string; containerPort: number }>;
  caddyEmail?: string;
  // Lightsail (staging) only. When enabled, a Lightsail StaticIp is
  // allocated + attached so the box IP survives stop/start. Absent/false
  // (the default) uses the instance's ephemeral dynamic public IP.
  staticIp?: { enabled: boolean };
  // Where app logs should be shipped. Undefined / "cloudwatch" = managed
  // CloudWatch (the default, unchanged path); "grafana-loki" = ship to the
  // environment's connected Grafana/Loki via an injected log collector.
  observability?: {
    logsDestination?: "cloudwatch" | "grafana-loki";
  };
  // serviceName -> "registry/repo:tag". Overrides a docker-compose service's
  // image: at deploy time (EC2/Lightsail) with a chosen ECR image. Optional
  // and per-service, so a service absent from the map keeps its compose image.
  imageOverrides?: Record<string, string>;
  // Extra firewall ports to open on the box, beyond the baked-in 22/80/443.
  // EC2 (SG ingress) + Lightsail (instance public ports) only. Each entry is
  // a single port; cidr defaults to 0.0.0.0/0 when omitted.
  openPorts?: Array<{
    port: number;
    protocol: "tcp" | "udp";
    cidr?: string;
    description?: string;
  }>;
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

// ─── Lightsail routing (defined here because heizenConfigSchema below
// references it) ────────────────────────────────────────────────────────
// Maps a compose service name to a public domain. Used by the Lightsail
// (staging) deploy path to generate the Caddyfile. ECS template ignores
// this — it derives routing from services[].domain instead.
export const routingEntrySchema = z.object({
  domain: z.string().min(1),
  /** Container port on the compose service to forward to. Must match
   *  one of the ports the compose service exposes. */
  containerPort: z.number().int().positive(),
});

export type RoutingEntry = z.infer<typeof routingEntrySchema>;

export const lightsailBundleSchema = z.enum([
  "nano",
  "micro",
  "small",
  "medium",
  "large",
]);

export type LightsailBundle = z.infer<typeof lightsailBundleSchema>;

export const heizenConfigSchema = z.object({
  version: z.literal(1),
  project: z.string().min(1),
  env: z.enum(["staging", "production"]),
  region: z
    .string()
    .min(1)
    .refine(isAwsRegion, { message: "Unsupported AWS region" }),
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

  // ── Lightsail (staging) only ──────────────────────────────────────────
  // Lightsail instance bundle. Sized like the ECS DB presets but on the
  // VM side. Defaults to "small" if unset.
  lightsailBundle: lightsailBundleSchema.optional(),
  // Per compose-service routing for Caddy on the Lightsail box. Key is
  // the service name from docker-compose.yml. Ignored by the ECS
  // (production) template.
  routing: z.record(z.string(), routingEntrySchema).optional(),
  // Email registered with Let's Encrypt for cert renewal notifications.
  // Falls back to the platform admin email at deploy time when unset.
  caddyEmail: z.string().optional(),
  // Lightsail-only static IP toggle. Optional so existing configs (no key)
  // validate and fall back to the dynamic-IP default.
  staticIp: z.object({ enabled: z.boolean() }).optional(),
  // Optional so existing configs with no observability block still validate
  // (keeps the default cloudwatch path untouched).
  observability: z
    .object({
      logsDestination: z.enum(["cloudwatch", "grafana-loki"]).optional(),
    })
    .optional(),
  imageOverrides: z.record(z.string(), z.string()).optional(),
  // Extra firewall ports (EC2 SG ingress + Lightsail public ports). The
  // 22/80/443 baseline is always open regardless of this list.
  openPorts: z
    .array(
      z.object({
        port: z.number().int().min(1).max(65535),
        protocol: z.enum(["tcp", "udp"]),
        cidr: z
          .string()
          .refine(isValidCidr, { message: "Invalid CIDR block" })
          .optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

// Parsed docker-compose.yml surfaced by the indexer. Optional because
// not every repo has one — ECS-only projects skip this entirely.
export const composePortSchema = z.object({
  host: z.number().nullable(),
  container: z.number(),
  protocol: z.enum(["tcp", "udp"]),
});

export const composeServiceSchema = z.object({
  name: z.string(),
  image: z.string().nullable(),
  hasBuild: z.boolean(),
  ports: z.array(composePortSchema),
  envRefs: z.array(z.string()),
  hasVolumes: z.boolean(),
  dependsOn: z.array(z.string()),
});

export const parsedComposeSchema = z.object({
  filePath: z.string(),
  raw: z.string(),
  services: z.array(composeServiceSchema),
});

export type ComposePort = z.infer<typeof composePortSchema>;
export type ComposeService = z.infer<typeof composeServiceSchema>;
export type ParsedCompose = z.infer<typeof parsedComposeSchema>;

export const analyzerResultSchema = z.object({
  config: heizenConfigSchema,
  compose: parsedComposeSchema.nullable().optional(),
});

export type AnalyzerResult = z.infer<typeof analyzerResultSchema>;

