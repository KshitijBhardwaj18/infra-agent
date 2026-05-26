import { cn } from "@/lib/utils";

const colors: Record<
  string,
  { dot: string; text: string; bg: string }
> = {
  LIVE: { dot: "bg-green-500", text: "text-green-400", bg: "bg-green-500/10" },
  FAILED: { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
  DEPLOYING: {
    dot: "bg-blue-500 animate-pulse",
    text: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  SUCCESS: { dot: "bg-green-500", text: "text-green-400", bg: "bg-green-500/10" },
  NOT_DEPLOYED: { dot: "bg-zinc-600", text: "text-zinc-400", bg: "bg-zinc-800" },
  QUEUED: { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800" },
  CANCELLED: { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800" },
};

function normalizeStatus(status: string) {
  return status.toUpperCase().replace(/ /g, "_");
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const key = normalizeStatus(status);
  const style = colors[key] ?? colors.QUEUED;
  const display = label ?? status.replace(/_/g, " ").toLowerCase();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        style.bg,
        style.text,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
      {display}
    </span>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const key = normalizeStatus(status);
  const style = colors[key] ?? colors.QUEUED;
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", style.dot, className)} />;
}
