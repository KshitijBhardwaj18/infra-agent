import { createAnthropic } from "@ai-sdk/anthropic";
import { env } from "./env";

/**
 * Whether the LLM-backed features (chat agent, incident analysis) are
 * configured. When false, callers should degrade gracefully rather than
 * throw — e.g. incident detection still records the raw signal, just
 * without an agent-written remedy.
 */
export function isLlmConfigured(): boolean {
  return !!env("ANTHROPIC_API_KEY");
}

/**
 * The Claude model used across the agent. Defaults to the latest Sonnet
 * (good balance of capability + latency for chat + SRE analysis); override
 * with ANTHROPIC_MODEL.
 */
export function anthropicModel() {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured — the SRE agent (chat + incident analysis) is unavailable.",
    );
  }
  const anthropic = createAnthropic({ apiKey });
  return anthropic(env("ANTHROPIC_MODEL") || "claude-sonnet-4-6");
}
