import { Rocket, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a deployment's `kind` (DEPLOY vs DESTROY) as a small badge.
 * Single source of truth so the deploy/destroy styling can't drift
 * between the project overview, the deployments list, and anywhere
 * else that shows a run's kind. This is orthogonal to StatusBadge,
 * which renders the run's lifecycle status (QUEUED/SUCCESS/...).
 */
export function KindBadge({
  kind,
  className,
}: {
  kind: "DEPLOY" | "DESTROY";
  className?: string;
}) {
  const isDestroy = kind === "DESTROY";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        isDestroy
          ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
          : "bg-info/10 text-info ring-1 ring-info/20",
        className,
      )}
    >
      {isDestroy ? (
        <Trash2 size={11} className="shrink-0" />
      ) : (
        <Rocket size={11} className="shrink-0" />
      )}
      {isDestroy ? "Destroy" : "Deploy"}
    </span>
  );
}
