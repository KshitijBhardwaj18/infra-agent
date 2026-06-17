import Handlebars from "handlebars";
import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { TemplateContext } from "./types";

const execFileAsync = promisify(execFile);
const TEMPLATES_ROOT = path.join(__dirname, "..", "templates");

Handlebars.registerHelper("camel", (str: string) =>
  str.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase()),
);

Handlebars.registerHelper("upper", (str: string) => str.toUpperCase());

Handlebars.registerHelper("json", (obj: unknown) =>
  JSON.stringify(obj, null, 2),
);

Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper("ne", (a: unknown, b: unknown) => a !== b);
Handlebars.registerHelper("join", (arr: string[], sep: string) => arr.join(sep));
Handlebars.registerHelper("inc", (n: number) => n + 1);

type TemplateFiles = Array<{ src: string; dest: string }>;

const ECS_TEMPLATE_FILES: TemplateFiles = [
  { src: "Pulumi.yaml.hbs", dest: "Pulumi.yaml" },
  { src: "package.json.hbs", dest: "package.json" },
  { src: "tsconfig.json.hbs", dest: "tsconfig.json" },
  { src: "index.ts.hbs", dest: "index.ts" },
  { src: "components/config.ts.hbs", dest: "components/config.ts" },
  { src: "components/networking.ts.hbs", dest: "components/networking.ts" },
  { src: "components/store.ts.hbs", dest: "components/store.ts" },
  { src: "components/loadbalancer.ts.hbs", dest: "components/loadbalancer.ts" },
  { src: "components/compute.ts.hbs", dest: "components/compute.ts" },
];

// Lightsail template ships only the three components it needs.
// No networking (Lightsail manages it), no store (Docker volumes on
// the box for ephemeral state, user brings their own RDS for real
// data), no separate loadbalancer (Caddy in a container).
const LIGHTSAIL_TEMPLATE_FILES: TemplateFiles = [
  { src: "Pulumi.yaml.hbs", dest: "Pulumi.yaml" },
  { src: "package.json.hbs", dest: "package.json" },
  { src: "tsconfig.json.hbs", dest: "tsconfig.json" },
  { src: "index.ts.hbs", dest: "index.ts" },
  { src: "components/config.ts.hbs", dest: "components/config.ts" },
  { src: "components/cloud-init.ts.hbs", dest: "components/cloud-init.ts" },
  { src: "components/instance.ts.hbs", dest: "components/instance.ts" },
];

// EC2 (single VM running docker-compose, production-grade). Reuses the
// production VPC/RDS/S3 patterns (networking, store) but swaps ECS for
// one EC2 box (instance) with an IAM instance profile (iam) that reads
// the compose/.env bundle from S3 (artifacts) at boot via cloud-init.
const EC2_TEMPLATE_FILES: TemplateFiles = [
  { src: "Pulumi.yaml.hbs", dest: "Pulumi.yaml" },
  { src: "package.json.hbs", dest: "package.json" },
  { src: "tsconfig.json.hbs", dest: "tsconfig.json" },
  { src: "index.ts.hbs", dest: "index.ts" },
  { src: "components/config.ts.hbs", dest: "components/config.ts" },
  { src: "components/networking.ts.hbs", dest: "components/networking.ts" },
  { src: "components/store.ts.hbs", dest: "components/store.ts" },
  { src: "components/iam.ts.hbs", dest: "components/iam.ts" },
  { src: "components/artifacts.ts.hbs", dest: "components/artifacts.ts" },
  { src: "components/cloud-init.ts.hbs", dest: "components/cloud-init.ts" },
  { src: "components/instance.ts.hbs", dest: "components/instance.ts" },
];

// env -> { templates dir on disk, list of files to render }.
// staging→Lightsail, production→ECS, ec2→single-VM compose.
const TEMPLATE_CONFIG: Record<
  "staging" | "production" | "ec2",
  { dir: string; files: TemplateFiles }
> = {
  staging: { dir: "lightsail", files: LIGHTSAIL_TEMPLATE_FILES },
  production: { dir: "production", files: ECS_TEMPLATE_FILES },
  ec2: { dir: "ec2", files: EC2_TEMPLATE_FILES },
};

async function installGeneratedDependencies(outputDir: string): Promise<void> {
  const baseDepsDir = process.env.PULUMI_BASE_DEPS_DIR;

  // Only use the symlink fast-path if the target ACTUALLY has the SDK
  // installed. Otherwise we'd symlink to nothing and pulumi up errors
  // with the vague "Pulumi SDK has not been installed". This guard
  // catches: (a) stale env var on a dev laptop that doesn't have the
  // /pulumi-deps dir, (b) volume not yet bootstrapped on container
  // first boot, (c) volume bootstrapped but missing @pulumi/pulumi
  // for any reason.
  if (baseDepsDir) {
    const sdkPath = path.join(baseDepsDir, "node_modules", "@pulumi", "pulumi");
    try {
      const s = await fs.stat(sdkPath);
      if (s.isDirectory()) {
        await fs.symlink(
          path.join(baseDepsDir, "node_modules"),
          path.join(outputDir, "node_modules"),
        );
        return;
      }
    } catch {
      // fall through to a fresh install — better than a broken symlink
    }
  }

  const env = { ...process.env, NODE_ENV: "production" };

  // bun first, npm as fallback. We surface the failures now instead of
  // swallowing them silently — a quiet bun fail would land us back at
  // "SDK not installed" with no breadcrumb.
  let bunErr: unknown = null;
  try {
    await execFileAsync("bun", ["install", "--silent"], { cwd: outputDir, env });
    return;
  } catch (err) {
    bunErr = err;
  }

  try {
    await execFileAsync("npm", ["install", "--silent"], { cwd: outputDir, env });
  } catch (npmErr) {
    const bunMsg = bunErr instanceof Error ? bunErr.message : String(bunErr);
    const npmMsg = npmErr instanceof Error ? npmErr.message : String(npmErr);
    throw new Error(
      `Failed to install Pulumi program dependencies in ${outputDir}. ` +
        `bun: ${bunMsg}. npm: ${npmMsg}`,
    );
  }
}

export async function renderTemplates(
  ctx: TemplateContext,
  env: "staging" | "production" | "ec2",
  outputDir: string,
): Promise<void> {
  const { dir, files } = TEMPLATE_CONFIG[env];
  const templatesDir = path.join(TEMPLATES_ROOT, dir);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, "components"), { recursive: true });

  for (const { src, dest } of files) {
    const templatePath = path.join(templatesDir, src);
    const templateSource = await fs.readFile(templatePath, "utf-8");
    const compiled = Handlebars.compile(templateSource, { noEscape: true });
    let rendered = compiled(ctx);
    if (dest === "Pulumi.yaml") {
      rendered = rendered
        .split("\n")
        .filter((line) => !/^\s*pulumi:template:/.test(line))
        .join("\n");
    }
    const outputPath = path.join(outputDir, dest);
    await fs.writeFile(outputPath, rendered, "utf-8");
  }

  await installGeneratedDependencies(outputDir);
}
