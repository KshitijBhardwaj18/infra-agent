import * as React from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Optional small line above the title — e.g. a section/breadcrumb
   *  hint ("Admin → Users"). Renders in uppercase muted-foreground. */
  eyebrow?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Page header — typography mirrors dev-tools: larger 28px title with
 * tighter leading, a subtle eyebrow above (when present), and a soft
 * border-bottom rule that anchors the page to the body content
 * underneath. The bottom rule is the single biggest "polish" cue that
 * distinguishes a thrown-together page from a designed one.
 */
function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn("pb-5 border-b border-border", className)}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate text-[28px] font-semibold leading-none tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-4 flex gap-2">{children}</div>}
    </div>
  );
}

export { PageHeader };
