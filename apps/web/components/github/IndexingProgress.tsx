"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IndexingSsePayload } from "@heizen/shared";

const STEPS = [
  { key: "cloning", label: "Cloning repository" },
  { key: "collecting", label: "Reading package files" },
  { key: "detecting", label: "Detecting services" },
  { key: "analyzing", label: "Generating config" },
  { key: "complete", label: "Done" },
];

export function IndexingProgress({ events }: { events: IndexingSsePayload[] }) {
  const completedSteps = new Set(events.map((e) => e.step));
  const currentStep = events[events.length - 1]?.step;
  const completeEvent = events.find((e) => e.step === "complete");
  const completeError =
    completeEvent?.data &&
    typeof completeEvent.data === "object" &&
    completeEvent.data !== null &&
    "error" in completeEvent.data
      ? String((completeEvent.data as { error: unknown }).error)
      : null;
  const isComplete = completedSteps.has("complete") && !completeError;

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-base font-medium">Analysing your codebase</h2>
      <p className="mt-1 text-sm text-muted-foreground">This takes about 10 seconds.</p>

      <div className="mt-6 space-y-3">
        {STEPS.map((step) => {
          const failed = step.key === "complete" && !!completeError;
          const done =
            completedSteps.has(step.key as IndexingSsePayload["step"]) &&
            (step.key !== "complete" || isComplete);
          const active = currentStep === step.key && !isComplete && !failed;

          return (
            <div key={step.key} className="flex items-center gap-3">
              {failed ? (
                <XCircle size={16} className="shrink-0 text-red-500" />
              ) : done ? (
                <CheckCircle2 size={16} className="shrink-0 text-green-500" />
              ) : active ? (
                <Loader2 size={16} className="shrink-0 animate-spin text-blue-500" />
              ) : (
                <Circle size={16} className="shrink-0 text-zinc-700" />
              )}
              <span
                className={cn(
                  "text-sm",
                  failed ? "text-red-400" : done || active ? "text-white" : "text-zinc-600",
                  active && "animate-pulse",
                )}
              >
                {failed ? "Failed" : step.label}
              </span>
            </div>
          );
        })}
      </div>
      {completeError && (
        <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {completeError}
        </p>
      )}
    </div>
  );
}
