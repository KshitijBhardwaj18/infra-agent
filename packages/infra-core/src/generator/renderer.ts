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

const TEMPLATE_FILES: Array<{ src: string; dest: string }> = [
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

async function installGeneratedDependencies(outputDir: string): Promise<void> {
  const baseDepsDir = process.env.PULUMI_BASE_DEPS_DIR;
  if (baseDepsDir) {
    await fs.symlink(
      path.join(baseDepsDir, "node_modules"),
      path.join(outputDir, "node_modules"),
    );
    return;
  }

  const env = { ...process.env, NODE_ENV: "production" };

  try {
    await execFileAsync("bun", ["install", "--silent"], { cwd: outputDir, env });
    return;
  } catch {
    // fall back to npm when bun is unavailable (e.g. in minimal containers)
  }

  await execFileAsync("npm", ["install", "--silent"], { cwd: outputDir, env });
}

export async function renderTemplates(
  ctx: TemplateContext,
  env: "staging" | "production",
  outputDir: string,
): Promise<void> {
  const templatesDir = path.join(TEMPLATES_ROOT, env);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, "components"), { recursive: true });

  for (const { src, dest } of TEMPLATE_FILES) {
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
