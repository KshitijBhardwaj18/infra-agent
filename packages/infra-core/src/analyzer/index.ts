import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { AnalyzerResult } from "../types/config";
import { shallowClone } from "./clone";
import { collectFiles } from "./collect";
import { buildConfigFromStatic } from "./config-builder";
import { staticAnalysis } from "./static";

export type IndexingStepCallback = (step: string, data?: unknown) => void;

export interface AnalyzeOptions {
  repoUrl: string;
  token: string;
  branch: string;
  projectId: string;
  projectName: string;
  env: "staging" | "production";
  onStep?: IndexingStepCallback;
}

export async function analyze(options: AnalyzeOptions): Promise<AnalyzerResult> {
  const { repoUrl, token, branch, projectId, projectName, env, onStep } =
    options;

  const cloneDir = path.join(os.tmpdir(), `clone-${projectId}`);

  try {
    onStep?.("cloning");
    await shallowClone(repoUrl, token, branch, cloneDir);

    onStep?.("collecting");
    const files = await collectFiles(cloneDir);

    onStep?.("detecting");
    const staticResult = staticAnalysis(files);

    onStep?.("analyzing");
    const config = buildConfigFromStatic(staticResult, projectName, env);
    const result = { config };

    onStep?.("complete", result);
    return result;
  } finally {
    await fs.rm(cloneDir, { recursive: true, force: true }).catch(() => {});
  }
}
