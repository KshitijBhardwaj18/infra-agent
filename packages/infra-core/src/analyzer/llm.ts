import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { analyzerEnvVarSchema } from "../types/config";
import type { AnalyzerEnvVar } from "../types/config";
import type { CollectedFiles } from "./collect";
import { classifyEnvVarsRuleBased } from "./env-vars";
import type { StaticAnalysis } from "./static";

const envVarsSchema = z.object({
  envVars: z.array(analyzerEnvVarSchema),
});

export async function classifyEnvVarsWithLlm(
  files: CollectedFiles,
  staticResult: StaticAnalysis,
): Promise<AnalyzerEnvVar[]> {
  const fallback = classifyEnvVarsRuleBased(staticResult);

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  const prompt = `Classify environment variables for AWS deployment.

Rules:
- Mark as "auto_generated": DATABASE_URL, REDIS_URL, AWS_S3_BUCKET, NODE_ENV, AWS_REGION
- Mark as "needs_user_input": secrets, API keys, third-party tokens, and anything user-specific
- Return one entry per service/key pair from the detected list below
- Do not invent env vars that are not listed

Detected services and env keys:
${JSON.stringify(
  staticResult.services.map((service) => ({
    service: service.name,
    keys: service.envKeys,
  })),
  null,
  2,
)}

Env example key lists:
${JSON.stringify(
  files.appEnvExamples.map((example) => ({
    app: example.app,
    keys: example.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0]?.trim())
      .filter(Boolean),
  })),
  null,
  2,
)}`;

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5"),
      schema: envVarsSchema,
      prompt,
    });

    return object.envVars.length > 0 ? object.envVars : fallback;
  } catch {
    return fallback;
  }
}
