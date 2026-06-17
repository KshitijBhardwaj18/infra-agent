import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { AnalyzerResult } from "../types/config";
import { shallowClone } from "./clone";
import { collectFiles } from "./collect";
import { buildConfigFromStatic } from "./config-builder";
import { staticAnalysis } from "./static";
import { findAndParseCompose } from "./compose";

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

    // docker-compose parsing is opportunistic. A failure shouldn't kill
    // the entire indexing run — surface in the SSE stream and continue
    // with config-only output. Repos without a compose file return null.
    let compose: AnalyzerResult["compose"] = null;
    try {
      compose = await findAndParseCompose(cloneDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onStep?.("compose_error", { message });
    }

    onStep?.("analyzing");
    const config = buildConfigFromStatic(staticResult, projectName, env);
    const result: AnalyzerResult = { config, compose: compose ?? null };

    onStep?.("complete", result);
    return result;
  } finally {
    await fs.rm(cloneDir, { recursive: true, force: true }).catch(() => {});
  }
}
