import type { CollectedFiles } from "./collect";

export interface StaticService {
  name: string;
  type: "backend" | "frontend" | "worker";
  port?: number;
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
  exposePorts: number[];
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

function parseExposePorts(dockerfile?: string): number[] {
  if (!dockerfile) return [];
  const ports: number[] = [];
  const regex = /^EXPOSE\s+(\d+)/gim;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(dockerfile)) !== null) {
    ports.push(Number(match[1]));
  }
  return ports;
}

function parsePortFromEnv(content: string): number | undefined {
  for (const line of content.split("\n")) {
    const match = line.match(/^PORT\s*=\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return undefined;
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
  const exposePorts = parseExposePorts(files.dockerfile);

  const services: StaticService[] = [];

  for (const { app, content } of files.appPackageJsons) {
    const scripts = (content.scripts as Record<string, string>) ?? {};
    if (!scripts.start) continue;

    const type = detectServiceType(content);
    const envExample = files.appEnvExamples.find((e) => e.app === app);
    const envKeys = envExample ? parseEnvKeys(envExample.content) : [];
    const portFromEnv = envExample
      ? parsePortFromEnv(envExample.content)
      : undefined;

    services.push({
      name: app,
      type,
      port: type !== "worker" ? (portFromEnv ?? exposePorts[0] ?? 3000) : undefined,
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
    exposePorts,
  };
}
