import type { CollectedFiles } from "./collect";

export interface StaticService {
  name: string;
  type: "backend" | "frontend" | "worker";
  command: string;
  envKeys: string[];
}

export interface StaticAnalysis {
  monorepoTool: string | null;
  services: StaticService[];
  dependencies: {
    postgres: boolean;
    redis: boolean;
    s3: boolean;
  };
  dockerfilePath: string;
}

const POSTGRES_PACKAGES = [
  "@prisma/client",
  "pg",
  "typeorm",
  "drizzle-orm",
  "sequelize",
];
const REDIS_PACKAGES = ["ioredis", "bullmq", "redis"];
const S3_PACKAGES = ["@aws-sdk/client-s3", "aws-sdk", "multer-s3"];

function detectServiceType(
  pkg: Record<string, unknown>,
): "backend" | "frontend" | "worker" {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  if (deps["@nestjs/core"] || deps["express"] || deps["fastify"]) {
    return "backend";
  }
  if (deps["next"] || deps["vite"] || deps["react"]) {
    return "frontend";
  }
  if (deps["bullmq"]) {
    return "worker";
  }
  return "backend";
}

function parseEnvKeys(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]!.trim())
    .filter(Boolean);
}

function collectAllDeps(files: CollectedFiles): Set<string> {
  const deps = new Set<string>();
  const addDeps = (pkg: Record<string, unknown>) => {
    for (const key of Object.keys(
      (pkg.dependencies as Record<string, string>) ?? {},
    )) {
      deps.add(key);
    }
    for (const key of Object.keys(
      (pkg.devDependencies as Record<string, string>) ?? {},
    )) {
      deps.add(key);
    }
  };

  if (files.rootPackageJson) addDeps(files.rootPackageJson);
  for (const { content } of files.appPackageJsons) addDeps(content);
  for (const { content } of files.packageDeps) addDeps(content);

  return deps;
}

export function staticAnalysis(files: CollectedFiles): StaticAnalysis {
  const allDeps = collectAllDeps(files);

  const services: StaticService[] = [];

  for (const { app, content } of files.appPackageJsons) {
    const scripts = (content.scripts as Record<string, string>) ?? {};
    if (!scripts.start) continue;

    const type = detectServiceType(content);
    const envExample = files.appEnvExamples.find((e) => e.app === app);
    const envKeys = envExample ? parseEnvKeys(envExample.content) : [];

    services.push({
      name: app,
      type,
      command: scripts.start,
      envKeys,
    });
  }

  return {
    monorepoTool: files.monorepoConfig?.tool ?? null,
    services,
    dependencies: {
      postgres: POSTGRES_PACKAGES.some((p) => allDeps.has(p)),
      redis: REDIS_PACKAGES.some((p) => allDeps.has(p)),
      s3: S3_PACKAGES.some((p) => allDeps.has(p)),
    },
    dockerfilePath: files.dockerfile ? "Dockerfile" : "Dockerfile",
  };
}
