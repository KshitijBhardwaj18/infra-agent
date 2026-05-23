import Handlebars from "handlebars";
import * as fs from "fs/promises";
import * as path from "path";

// Resolve templates dir relative to this file (works in both CJS and ESM builds)
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
    const rendered = compiled(ctx);
    const outputPath = path.join(outputDir, dest);
    await fs.writeFile(outputPath, rendered, "utf-8");
  }

  await execFileAsync("npm", ["install", "--silent"], {
    cwd: outputDir,
    env: { ...process.env, NODE_ENV: "production" },
  });
}
