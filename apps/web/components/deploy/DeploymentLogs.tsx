"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useSse } from "@/hooks/useSse";
import type { DeploymentLogPayload } from "@heizen/shared";

const PHASES = ["DOCKER_BUILD", "DOCKER_PUSH", "PULUMI", "SYSTEM"] as const;

export function DeploymentLogs({
  projectId,
  envId,
  deployId,
}: {
  projectId: string;
  envId: string;
  deployId: string;
}) {
  const url = `/api/projects/${projectId}/environments/${envId}/deployments/${deployId}/logs/stream`;
  const { data: logs, connected } = useSse<DeploymentLogPayload>(url);

  const [activePhase, setActivePhase] = useState<(typeof PHASES)[number]>("DOCKER_BUILD");

  const filtered = useMemo(
    () => logs.filter((l) => l.phase === activePhase),
    [logs, activePhase],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            connected ? "bg-green-500" : "bg-red-500",
          )}
        />
        <span className="text-sm text-muted-foreground">
          {connected ? "Live" : "Disconnected"}
        </span>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {PHASES.map((phase) => (
          <button
            key={phase}
            onClick={() => setActivePhase(phase)}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              activePhase === phase
                ? "border-b-2 border-white text-white"
                : "text-muted-foreground hover:text-white",
            )}
          >
            {phase.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs">
        {filtered.map((log, i) => (
          <div
            key={i}
            className={cn(
              "py-0.5",
              log.level === "error" && "text-red-400",
              log.level === "info" && "text-zinc-300",
            )}
          >
            {log.message}
          </div>
        ))}
        {filtered.length === 0 && (
          <span className="text-muted-foreground">Waiting for logs...</span>
        )}
      </div>
    </div>
  );
}
