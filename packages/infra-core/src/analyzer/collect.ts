import * as fs from "fs/promises";
import * as path from "path";

export interface CollectedFiles {
  dockerfile?: string;
  dockerCompose?: string;
  rootPackageJson?: Record<string, unknown>;
  monorepoConfig?: { tool: string; content: string };
  appPackageJsons: Array<{ app: string; content: Record<string, unknown> }>;
  appEnvExamples: Array<{ app: string; content: string }>;
  packageDeps: Array<{ pkg: string; content: Record<string, unknown> }>;
}

async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readTextSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function collectFiles(repoDir: string): Promise<CollectedFiles> {
  const result: CollectedFiles = {
    appPackageJsons: [],
    appEnvExamples: [],
    packageDeps: [],
  };

  result.dockerfile = (await readTextSafe(path.join(repoDir, "Dockerfile"))) ?? undefined;
  result.dockerCompose =
    (await readTextSafe(path.join(repoDir, "docker-compose.yml"))) ?? undefined;
  result.rootPackageJson =
    (await readJsonSafe(path.join(repoDir, "package.json"))) ?? undefined;

  for (const tool of ["turbo", "nx", "lerna"] as const) {
    const configFile =
      tool === "turbo"
        ? "turbo.json"
        : tool === "nx"
          ? "nx.json"
          : "lerna.json";
    const content = await readTextSafe(path.join(repoDir, configFile));
    if (content) {
      result.monorepoConfig = { tool, content };
      break;
    }
  }

  const appsDir = path.join(repoDir, "apps");
  for (const app of await listDirs(appsDir)) {
    const pkgJson = await readJsonSafe(path.join(appsDir, app, "package.json"));
    if (pkgJson) {
      result.appPackageJsons.push({ app, content: pkgJson });
    }
    const envExample = await readTextSafe(path.join(appsDir, app, ".env.example"));
    if (envExample) {
      result.appEnvExamples.push({ app, content: envExample });
    }
  }

  const packagesDir = path.join(repoDir, "packages");
  for (const pkg of await listDirs(packagesDir)) {
    const pkgJson = await readJsonSafe(path.join(packagesDir, pkg, "package.json"));
    if (pkgJson) {
      result.packageDeps.push({ pkg, content: pkgJson });
    }
  }

  return result;
}
