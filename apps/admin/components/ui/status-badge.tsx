import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        success: "bg-success/10 text-success ring-1 ring-success/20",
        warning: "bg-warning/10 text-warning-foreground ring-1 ring-warning/30",
        destructive: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
        info: "bg-info/10 text-info ring-1 ring-info/20",
        muted: "bg-muted text-muted-foreground",
        purple: "bg-purple/10 text-purple ring-1 ring-purple/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const dotVariants: Record<string, string> = {
  LIVE: "bg-success",
  FAILED: "bg-destructive",
  DEPLOYING: "bg-info animate-pulse",
  SUCCESS: "bg-success",
  NOT_DEPLOYED: "bg-muted-foreground/50",
  QUEUED: "bg-muted-foreground/50",
  CANCELLED: "bg-muted-foreground/50",
  TODO: "bg-info",
  IN_PROGRESS: "bg-purple animate-pulse",
  TESTING: "bg-warning",
  DONE: "bg-success",
};

const badgeVariantMap: Record<string, VariantProps<typeof statusBadgeVariants>["variant"]> = {
  LIVE: "success",
  FAILED: "destructive",
  DEPLOYING: "info",
  SUCCESS: "success",
  NOT_DEPLOYED: "muted",
  QUEUED: "muted",
  CANCELLED: "muted",
  TODO: "info",
  IN_PROGRESS: "purple",
  TESTING: "warning",
  DONE: "success",
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
  const variant = badgeVariantMap[key] ?? "muted";
  const dotClass = dotVariants[key] ?? dotVariants.QUEUED;
  const display = label ?? status.replace(/_/g, " ").toLowerCase();

  return (
    <span className={cn(statusBadgeVariants({ variant }), "capitalize", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
      {display}
    </span>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const key = normalizeStatus(status);
  const dotClass = dotVariants[key] ?? dotVariants.QUEUED;
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass, className)} />;
}
