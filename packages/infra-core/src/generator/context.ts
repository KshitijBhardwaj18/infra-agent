import type { HeizenConfig } from "../types/config";
import type { HeizenEnvConfig } from "../types/env-config";
import { DB_PRESETS, CACHE_PRESETS } from "../types/presets";
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

  // ── Pre-pass: find default ALB service name ───────────────────────
  // Must be computed before services.map() so targetGroupVar can use it.
  const defaultAlbServiceName = (() => {
    const candidates = cfg.services.filter(
      (s) => s.type !== "worker" && s.port != null,
    );
    return (
      candidates.find((s) => s.type === "frontend")?.name ??
      candidates.find((s) => s.type === "backend")?.name ??
      candidates[0]?.name
    );
  })();

  // ── Service contexts ──────────────────────────────────────────────
  const services: ServiceCtx[] = cfg.services.map((s) => {
    const isBackend = s.type === "backend";
    const isFrontend = s.type === "frontend";
    const isWorker = s.type === "worker";
    const receivesInfraEnv = isBackend || isWorker;
    const hasDomain = s.type !== "worker" && !!s.domain;

    const isInAlb =
      s.port != null &&
      !isWorker &&
      (s.name === defaultAlbServiceName || hasDomain);

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
        pulumiAllSources.push("db.endpoint", "cfg.dbPassword");
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

    const port = s.port ?? null;

    return {
      name: s.name,
      type: s.type,
      port,
      domain: s.domain ?? null,
      command: parseCommand(s.command),
      cpuValue: String(s.cpu),
      memoryValue: String(s.memory),
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
      envFromNodeEnv: true,
      pulumiAllSources,
      pulumiDestructure,
      targetGroupVar: isInAlb ? `${camelize(s.name)}Tg` : null,
      tgName: `${prefix}-${s.name}-tg`.slice(0, 32),
      healthCheck: s.healthCheck,
    };
  });

  const servicesWithAlb = services.filter((s) => s.targetGroupVar !== null);
  const servicesWithDomain = servicesWithAlb.filter((s) => s.hasDomain);
  const servicesWithPort = services.filter(
    (s) => s.port !== null && !s.isWorker,
  );
  const hasAlb = cfg.loadBalancer.enabled;

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

  const defaultService =
    servicesWithAlb.find((s) => s.isFrontend) ??
    servicesWithAlb.find((s) => s.isBackend) ??
    servicesWithAlb[0];
  const defaultTargetGroupVar = defaultService
    ? `${camelize(defaultService.name)}Tg`
    : "";

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
    servicesWithPort,
    servicesWithAlb,
    defaultTargetGroupVar,
    configExports,
    logRetentionDays: cfg.env === "production" ? 90 : 7,
    containerInsights: cfg.env === "production",
  };
}
