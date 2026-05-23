import type { AnalyzerEnvVar } from "../types/config";
import type { StaticAnalysis } from "./static";

const AUTO_GENERATED_KEYS = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "AWS_S3_BUCKET",
  "NODE_ENV",
  "AWS_REGION",
]);

export function classifyEnvVarsRuleBased(staticResult: StaticAnalysis): AnalyzerEnvVar[] {
  const envVars: AnalyzerEnvVar[] = [];
  const seen = new Set<string>();

  for (const service of staticResult.services) {
    for (const key of service.envKeys) {
      const id = `${service.name}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);

      envVars.push({
        service: service.name,
        key,
        classification: AUTO_GENERATED_KEYS.has(key) ? "auto_generated" : "needs_user_input",
      });
    }
  }

  return envVars;
}
