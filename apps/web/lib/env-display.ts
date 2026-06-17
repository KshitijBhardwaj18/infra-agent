// Display helpers for environments whose slug/name may be null (rows created
// before those columns existed). Falls back to the env `type` so the UI
// always has a usable URL slug and label.

type EnvLike = { type: string; slug?: string | null; name?: string | null };

/** URL-safe slug for routing; falls back to the lowercased type. */
export function envSlugOf(e: EnvLike): string {
  return e.slug ?? e.type.toLowerCase();
}

/** Human label; falls back to the title-cased type (Staging/Production). */
export function envNameOf(e: EnvLike): string {
  return (
    e.name ?? e.type.charAt(0).toUpperCase() + e.type.slice(1).toLowerCase()
  );
}
