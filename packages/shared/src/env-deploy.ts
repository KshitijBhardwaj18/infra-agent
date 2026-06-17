import type { DeployStrategy, EnvType } from "./heizen-config";

/**
 * Minimal shape of an Environment row needed to resolve how it deploys.
 * Structural (no Prisma dependency) so both api and web can use it. All
 * fields optional so legacy rows (or partial client objects) resolve via
 * the `type` fallback.
 */
export interface EnvDeployInput {
  type?: string | null;
  slug?: string | null;
  tier?: "STAGING" | "PRODUCTION" | null;
  deployStrategy?: DeployStrategy | null;
}

export interface ResolvedEnvDeploy {
  /** URL-safe, unique-per-project identity. Drives the Pulumi stack
   *  prefix + state bucket so each env is isolated. */
  slug: string;
  /** Behavioral tier — drives presets/scoping, independent of template. */
  tier: "STAGING" | "PRODUCTION";
  /** Lowercased tier used for heizenConfig.env (the generator's preset mode). */
  envType: EnvType;
  /** Which deploy paradigm this env uses. */
  deployStrategy: DeployStrategy;
  /** Which Pulumi template dir to render. */
  templateKey: "production" | "staging" | "ec2";
}

/**
 * Single source of truth for "how does this environment deploy". Prefers the
 * explicit slug/tier/deployStrategy columns and falls back to the legacy
 * `type`-based inference (PRODUCTION→ECS/production, else LIGHTSAIL/staging)
 * for rows created before those columns existed. For the auto-scaffolded
 * STAGING/PRODUCTION envs this returns exactly the same slug/tier/strategy/
 * templateKey the worker computed inline before, so existing deploys are
 * unchanged.
 */
export function resolveEnvDeploy(env: EnvDeployInput): ResolvedEnvDeploy {
  // A CUSTOM env must always carry its own slug. Falling back to the
  // tier-derived slug here would collide with a scaffolded env, so surface
  // it as a bug in the create path rather than silently mis-resolving.
  if (env.type === "CUSTOM" && !env.slug) {
    throw new Error(
      "Custom environment is missing a slug — check the env-create path",
    );
  }
  const tier: "STAGING" | "PRODUCTION" =
    env.tier ?? (env.type === "PRODUCTION" ? "PRODUCTION" : "STAGING");
  const slug = env.slug ?? tier.toLowerCase();
  const envType: EnvType = tier === "PRODUCTION" ? "production" : "staging";
  const deployStrategy: DeployStrategy =
    env.deployStrategy ?? (tier === "PRODUCTION" ? "ECS" : "LIGHTSAIL");
  const templateKey =
    deployStrategy === "EC2_COMPOSE"
      ? "ec2"
      : deployStrategy === "ECS"
        ? "production"
        : "staging";
  return { slug, tier, envType, deployStrategy, templateKey };
}
