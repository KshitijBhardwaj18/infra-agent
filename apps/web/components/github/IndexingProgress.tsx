"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IndexingSsePayload } from "@heizen/shared";

const STEPS = [
  { key: "cloning", label: "Cloning repository" },
  { key: "collecting", label: "Reading files" },
  { key: "detecting", label: "Detecting services" },
  { key: "analyzing", label: "Generating config" },
  { key: "complete", label: "Complete" },
];

export function IndexingProgress({ events }: { events: IndexingSsePayload[] }) {
  const completedSteps = new Set(events.map((e) => e.step));
  const currentStep = events[events.length - 1]?.step;
  const isComplete = completedSteps.has("complete");
  const hasError = events.some((e) => e.data && typeof e.data === "object" && "error" in (e.data as object));

  return (
    <div className="max-w-md mx-auto space-y-3">
      <h2 className="text-lg font-semibold mb-4">Analyzing codebase...</h2>
      {STEPS.map((step) => {
        const done = completedSteps.has(step.key as IndexingSsePayload["step"]) &&
          (step.key !== "complete" || isComplete);
        const active = currentStep === step.key && !isComplete;

        return (
          <div
            key={step.key}
            className={cn(
              "flex items-center gap-3 rounded-md px-4 py-3",
              active && "bg-zinc-800",
            )}
          >
            {done ? (
              <Check size={16} className="text-[var(--success)]" />
            ) : active ? (
              <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-zinc-600" />
            )}
            <span className={cn("text-sm", done && "text-[var(--success)]")}>
              {step.label}
            </span>
          </div>
        );
      })}
      {hasError && (
        <p className="text-sm text-[var(--error)]">
          Indexing failed. Try re-indexing from the project settings.
        </p>
      )}
    </div>
  );
}
