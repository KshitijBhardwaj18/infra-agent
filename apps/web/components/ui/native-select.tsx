import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. We deliberately keep the native element
 * (not the base-ui Select popup) for the dense deploy/config forms —
 * it's reliable, accessible, and has no portal/positioning surprises.
 * This is the single source of truth for select styling so the forms
 * stop hand-rolling (and drifting) inline className strings.
 *
 * Visual match: the compact form Input (h-8, text-xs, border-border).
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "flex h-8 w-full appearance-none rounded-md border border-border bg-background pl-2.5 pr-8 text-xs outline-none transition-colors hover:border-ring/40 focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60"
      />
    </div>
  );
}

export { NativeSelect };
