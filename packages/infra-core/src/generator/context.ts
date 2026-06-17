import type { HeizenConfig } from "../types/config";
import type { HeizenEnvConfig } from "../types/env-config";
import { DB_PRESETS, CACHE_PRESETS } from "../types/presets";
import { LIGHTSAIL_BUNDLE_PRESETS } from "@heizen/shared";
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
  // Worker-threaded knobs not part of HeizenConfig. `envSlug` is the env's
  // unique slug so custom envs get distinct resource names; it defaults to
  // cfg.env, which for the scaffolded envs equals their slug (so the render
  // is unchanged). Optional so staging/ECS callers are unaffected.
  opts?: { ec2InstanceType?: string; envId?: string; envSlug?: string },
): TemplateContext {
  // A blank region would render `aws:region:` empty into Pulumi.yaml and let
  // the AWS provider silently fall back to its default chain — fail loudly.
  if (!cfg.region || !cfg.region.trim()) {
    throw new Error(
      "HeizenConfig.region is required to build the deploy template context",
    );
  }
  const prefix = `${cfg.project}-${opts?.envSlug ?? cfg.env}`;

  // Normalize user-configured extra firewall ports once (cidr/description
  // always filled) so both the Lightsail and EC2 templates render the same
  // shape. Empty by default → the baseline 22/80/443 rules are unchanged.
  const openPorts = (cfg.openPorts ?? []).map((p) => ({
    port: p.port,
    protocol: p.protocol,
    cidr: p.cidr && p.cidr.trim() ? p.cidr.trim() : "0.0.0.0/0",
    description: p.description?.trim() || "Custom port",
  }));

  // Lightsail (staging) template uses a much smaller context. None of
  // the ECS-specific computation (services, scaling, ALB rules, RDS)
  // applies. We pass the bundleId from the preset and let cloud-init
  // do the rest via Pulumi config secrets supplied by the worker.
  if (cfg.env === "staging") {
    const bundleKey = cfg.lightsailBundle ?? "small";
    const bundle = LIGHTSAIL_BUNDLE_PRESETS[bundleKey];
    return {
      prefix,
      project: cfg.project,
      env: cfg.env,
      region: cfg.region,
      domain: cfg.domain ?? "",
      ecrImage: cfg.ecr.image,
      ecrTag: cfg.ecr.tag,
      fullImage: `${cfg.ecr.image}:${cfg.ecr.tag}`,
      // The Lightsail template reads {{bundleId}}; the rest of these
      // fields are required by the TemplateContext shape but unused.
      bundleId: bundle.bundleId,
      natEnabled: false,
      natIsDual: false,
      natIsSingle: false,
      vpcCidr: "10.0.0.0/16",
      ecsPortRangeFrom: 0,
      ecsPortRangeTo: 0,
      hasAlb: false,
      hasDatabase: false,
      hasCache: false,
      hasStorage: false,
      needsRdsSg: false,
      needsRedisSg: false,
      database: null,
      cache: null,
      services: [],
      servicesWithDomain: [],
      servicesWithPort: [],
      servicesWithAlb: [],
      defaultTargetGroupVar: "",
      configExports: [],
      logRetentionDays: 7,
      containerInsights: false,
      lokiLogs: cfg.observability?.logsDestination === "grafana-loki",
      envId: opts?.envId ?? "",
      // Default OFF: a static IP is opt-in. When off the box uses its
      // dynamic public IP (which the template exports as staticIpAddress).
      staticIpEnabled: cfg.staticIp?.enabled ?? false,
      openPorts,
    };
  }

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
    // EC2 template only; default to a small general-purpose box.
    ec2InstanceType: opts?.ec2InstanceType ?? "t3.medium",
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
      ? (() => {
          // Default the size if unset — the EC2 RDS toggle enables
          // postgres without forcing a size pick, and DB_PRESETS[undefined]
          // would crash here. "micro" is the cheapest sane default.
          const dbSize = cfg.database.size ?? "micro";
          const preset = DB_PRESETS[dbSize];
          return {
          instanceClass: preset.instanceClass,
          dbName: cfg.database.dbName ?? cfg.project.replace(/-/g, "_"),
          dbUser: `${cfg.project.replace(/-/g, "_")}_admin`,
          multiAz: cfg.database.multiAz ?? false,
          // Kept for legacy staging template which still reads this; the
          // production template hardcodes false to keep `pulumi destroy`
          // working without manual AWS unprotect dance.
          deletionProtection: cfg.database.deletionProtection ?? false,
          backupRetentionDays: cfg.database.backupRetentionDays ?? 7,
          // Map storage to the DB size preset rather than a fixed 20GB.
          // A db.t4g.large with 8GB RAM on 20GB storage would auto-scale
          // or run out within a week of normal use.
          allocatedStorage: preset.allocatedStorageGb,
          storageType: "gp3",
          engineVersion: "16.4",
          encrypted: true,
          };
        })()
      : null,
    cache: hasCache
      ? {
          // Default the size if unset (same guard as the DB block) —
          // CACHE_PRESETS[undefined] would otherwise crash.
          nodeType: CACHE_PRESETS[cfg.cache.size ?? "micro"].nodeType,
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
    lokiLogs: cfg.observability?.logsDestination === "grafana-loki",
    envId: opts?.envId ?? "",
    // Lightsail-only flag; inert for the ECS/EC2 templates which never read it.
    staticIpEnabled: false,
    // Consumed by the EC2 SG ingress; the ECS template ignores it.
    openPorts,
  };
}
