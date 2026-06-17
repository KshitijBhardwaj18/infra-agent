/**
 * Shared time/duration formatters. Previously these lived as
 * copy-pasted local helpers in four different pages, which had drifted
 * (e.g. DeployingState's timeAgo lacked the days tier, so a 2-day-old
 * op rendered "48h ago" there but "2d ago" everywhere else). Keep all
 * relative-time rendering going through here so it stays consistent.
 */

/** "just now" / "5m ago" / "3h ago" / "2d ago" */
export function timeAgo(date: string | Date): string {
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "—" when no start, else "45s" / "3m 12s". */
export function formatDuration(
  start?: string | null,
  end?: string | null,
): string {
  if (!start) return "—";
  const endMs = end ? new Date(end).getTime() : Date.now();
  const secs = Math.floor((endMs - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
