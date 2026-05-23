import type { HeizenConfig } from "../types/config";
import { applyDefaults, getDefaults } from "../types/config";
import type { StaticAnalysis } from "./static";

export function buildConfigFromStatic(
  staticResult: StaticAnalysis,
  projectName: string,
  env: "staging" | "production",
): HeizenConfig {
  if (staticResult.services.length === 0) {
    throw new Error(
      "No deployable services found. Add a start script to at least one app in apps/*.",
    );
  }

  const defaults = getDefaults(env);
  const hasFrontend = staticResult.services.some((service) => service.type === "frontend");

  const config: HeizenConfig = {
    version: 1,
    project: projectName,
    env,
    region: "us-east-1",
    dockerfilePath: staticResult.dockerfilePath,
    ecr: {
      image: projectName,
      tag: "latest",
    },
    networking: {
      nat: defaults.networking.nat,
      vpcCidr: defaults.networking.vpcCidr,
    },
    loadBalancer: { enabled: hasFrontend },
    services: staticResult.services.map((service) => {
      const base = {
        name: service.name,
        type: service.type,
        cpu: defaults.service.cpu,
        scaling: { ...defaults.service.scaling },
        command: service.command,
      };

      if (service.type === "worker") {
        return base;
      }

      return {
        ...base,
        port: service.port ?? 3000,
        ...(service.type === "backend"
          ? { healthCheck: { path: "/health", codes: "200" } }
          : {}),
      };
    }),
    database: staticResult.dependencies.postgres
      ? {
          engine: "postgres",
          size: defaults.database.size,
          multiAz: defaults.database.multiAz,
          deletionProtection: defaults.database.deletionProtection,
          backupRetentionDays: defaults.database.backupRetentionDays,
          dbName: projectName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 63),
        }
      : { engine: "none" },
    cache: staticResult.dependencies.redis
      ? { engine: "redis", size: defaults.cache.size }
      : { engine: "none" },
    storage: { enabled: staticResult.dependencies.s3 },
  };

  return applyDefaults(config);
}
