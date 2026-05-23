import type { HeizenConfig } from "../types/config";
import type { HeizenEnvConfig } from "../types/env-config";
import { CPU_PRESETS, DB_PRESETS, CACHE_PRESETS } from "../types/presets";
import type { TemplateContext, ServiceCtx, ConfigVar } from "./types";

function camelize(str: string): string {
  return str.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
}

function envVarToCamel(key: string): string {
  return camelize(key.toLowerCase());
}

function parseCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!parts) return [command];
  return parts.map((p) => p.replace(/^['"]|['"]$/g, ""));
}

export function buildTemplateContext(
  cfg: HeizenConfig,
  envCfg: HeizenEnvConfig,
): TemplateContext {
  const prefix = `${cfg.project}-${cfg.env}`;
  const hasDatabase = cfg.database.engine === "postgres";
  const hasCache = cfg.cache.engine === "redis";
  const hasStorage = cfg.storage.enabled;

  const allConfigVars: Map<string, string> = new Map();

  for (const key of Object.keys(envCfg.env.shared ?? {})) {
    allConfigVars.set(envVarToCamel(key), key);
  }

  const services: ServiceCtx[] = cfg.services.map((s) => {
    const cpuPreset = CPU_PRESETS[s.cpu];
    const isBackend = s.type === "backend";
    const isFrontend = s.type === "frontend";
    const isWorker = s.type === "worker";
    const receivesInfraEnv = isBackend || isWorker;
    const hasDomain = !!s.domain;

    const serviceVarKeys = new Set<string>();
    const serviceConfigVars: ConfigVar[] = [];

    for (const key of Object.keys(envCfg.env.shared ?? {})) {
      const cv = envVarToCamel(key);
      if (!serviceVarKeys.has(cv)) {
        serviceVarKeys.add(cv);
        serviceConfigVars.push({ envVar: key, configVar: cv });
        allConfigVars.set(cv, key);
      }
    }

    for (const key of Object.keys(envCfg.env[s.name] ?? {})) {
      const cv = envVarToCamel(key);
      if (!serviceVarKeys.has(cv)) {
        serviceVarKeys.add(cv);
        serviceConfigVars.push({ envVar: key, configVar: cv });
        allConfigVars.set(cv, key);
      }
    }

    const pulumiAllSources: string[] = [];
    const pulumiDestructure: string[] = [];

    if (receivesInfraEnv) {
      if (hasDatabase) {
        pulumiAllSources.push("db.endpoint", "dbPassword");
        pulumiDestructure.push("dbEndpoint", "dbPass");
      }
      if (hasCache) {
        pulumiAllSources.push(
          "redis.cacheNodes.apply((nodes: any[]) => nodes[0].address)",
        );
        pulumiDestructure.push("redisHost");
      }
      if (hasStorage) {
        pulumiAllSources.push("bucket.bucket");
        pulumiDestructure.push("bucketName");
      }
    }

    for (const cv of serviceConfigVars) {
      pulumiAllSources.push(`cfg.${cv.configVar}`);
      pulumiDestructure.push(`${cv.configVar}Val`);
    }

    return {
      name: s.name,
      type: s.type,
      port: s.port ?? null,
      domain: s.domain ?? null,
      command: parseCommand(s.command),
      cpuValue: cpuPreset.cpu,
      memoryValue: cpuPreset.memory,
      isBackend,
      isFrontend,
      isWorker,
      hasDomain,
      scalable: s.scaling.max > s.scaling.min,
      scaling: s.scaling,
      configVars: serviceConfigVars,
      receivesInfraEnv,
      envFromDb: receivesInfraEnv && hasDatabase,
      envFromRedis: receivesInfraEnv && hasCache,
      envFromBucket: receivesInfraEnv && hasStorage,
      envFromRegion: receivesInfraEnv && hasStorage,
      envFromNodeEnv: receivesInfraEnv,
      pulumiAllSources,
      pulumiDestructure,
      targetGroupVar: hasDomain ? `${camelize(s.name)}Tg` : null,
      healthCheck: s.healthCheck,
    };
  });

  const servicesWithDomain = services.filter((s) => s.hasDomain);
  const hasAlb = cfg.loadBalancer.enabled && servicesWithDomain.length > 0;

  const ports = services
    .map((s) => s.port)
    .filter((p): p is number => p !== null);
  const ecsPortRangeFrom = ports.length > 0 ? Math.min(...ports) : 3000;
  const ecsPortRangeTo = ports.length > 0 ? Math.max(...ports) : 3000;

  const configExports: ConfigVar[] = [];
  if (hasDatabase) {
    configExports.push({ envVar: "DATABASE_PASSWORD", configVar: "dbPassword" });
  }
  for (const [cv, envVar] of allConfigVars.entries()) {
    if (cv !== "dbPassword") {
      configExports.push({ envVar, configVar: cv });
    }
  }

  const defaultTargetGroupVar =
    servicesWithDomain.find((s) => s.isFrontend)?.targetGroupVar ??
    servicesWithDomain[0]?.targetGroupVar ??
    "";

  return {
    prefix,
    project: cfg.project,
    env: cfg.env,
    region: cfg.region,
    domain: cfg.domain ?? "",
    ecrImage: cfg.ecr.image,
    ecrTag: cfg.ecr.tag,
    fullImage: `${cfg.ecr.image}:${cfg.ecr.tag}`,
    natEnabled: cfg.networking.nat !== "none",
    natIsDual: cfg.networking.nat === "dual",
    natIsSingle: cfg.networking.nat === "single",
    vpcCidr: cfg.networking.vpcCidr ?? "10.0.0.0/16",
    ecsPortRangeFrom,
    ecsPortRangeTo,
    hasAlb,
    hasDatabase,
    hasCache,
    hasStorage,
    needsRdsSg: hasDatabase,
    needsRedisSg: hasCache,
    database: hasDatabase
      ? {
          instanceClass: DB_PRESETS[cfg.database.size!].instanceClass,
          dbName: cfg.database.dbName ?? cfg.project.replace(/-/g, "_"),
          dbUser: `${cfg.project.replace(/-/g, "_")}_admin`,
          multiAz: cfg.database.multiAz ?? false,
          deletionProtection: cfg.database.deletionProtection ?? false,
          backupRetentionDays: cfg.database.backupRetentionDays ?? 7,
          allocatedStorage: 20,
          storageType: "gp3",
          engineVersion: "16.4",
          encrypted: true,
        }
      : null,
    cache: hasCache
      ? {
          nodeType: CACHE_PRESETS[cfg.cache.size!].nodeType,
          engineVersion: "7.1",
        }
      : null,
    services,
    servicesWithDomain,
    defaultTargetGroupVar,
    configExports,
    logRetentionDays: cfg.env === "production" ? 90 : 7,
    containerInsights: cfg.env === "production",
  };
}
