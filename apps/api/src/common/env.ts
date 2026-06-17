/**
 * Read a process env var, trim it, and treat empty-after-trim as absent.
 *
 * Why: `process.env.X ?? fallback` and `!process.env.X` both treat
 * whitespace-only strings as "set" — so a deploy with `BETTER_AUTH_SECRET=" "`
 * would silently use " " as the HMAC key, sail through
 * `assertProductionConfig`, and never hit the dev fallback. Using this helper
 * means `env("X") ?? fallback` falls back as expected, and `!env(k)` correctly
 * flags whitespace-only values as unset.
 */
export function env(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Like `env()`, but throws when the variable is missing or whitespace-only. */
export function requiredEnv(name: string): string {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
