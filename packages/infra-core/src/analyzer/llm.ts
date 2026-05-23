import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { analyzerResultSchema } from "../types/config";
import type { AnalyzerResult } from "../types/config";
import type { CollectedFiles } from "./collect";
import type { StaticAnalysis } from "./static";

export async function analyzeWithLlm(
  files: CollectedFiles,
  staticResult: StaticAnalysis,
  projectName: string,
  env: "staging" | "production",
): Promise<AnalyzerResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY must be set");
  }

  const prompt = `You are analyzing a codebase to produce a HeizenConfig for AWS deployment.

Rules:
- packages/* directories are libraries, NOT services. Only apps/* with a "start" script are services.
- Workers (bullmq) have no port.
- Classify each env var as "auto_generated" (DATABASE_URL, REDIS_URL, AWS_S3_BUCKET, NODE_ENV) or "needs_user_input" (secrets, API keys).
- Use sensible defaults for CPU/scaling based on env type (${env}).
- Set database.engine to "postgres" if postgres deps detected, else "none".
- Set cache.engine to "redis" if redis deps detected, else "none".
- Set storage.enabled to true if s3 deps detected, else false.
- loadBalancer.enabled should be true if any frontend service exists.

Static analysis result:
${JSON.stringify(staticResult, null, 2)}

Relevant file contents:
Dockerfile: ${files.dockerfile?.slice(0, 2000) ?? "none"}
Root package.json: ${JSON.stringify(files.rootPackageJson)?.slice(0, 1000) ?? "none"}
App package.jsons: ${JSON.stringify(files.appPackageJsons.map((a) => ({ app: a.app, scripts: a.content.scripts, deps: a.content.dependencies })))}
Env examples: ${JSON.stringify(files.appEnvExamples.map((e) => ({ app: e.app, keys: e.content.split("\\n").filter((l) => l.includes("=")).map((l) => l.split("=")[0]) })))}

Project name: ${projectName}
Environment: ${env}`;

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: analyzerResultSchema,
    prompt,
  });

  return object;
}
