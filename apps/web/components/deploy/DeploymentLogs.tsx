"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useSse } from "@/hooks/useSse";
import { api } from "@/lib/api";
import type { DeploymentLogPayload, DeploymentPhase } from "@heizen/shared";

const PHASES = ["PULUMI", "SYSTEM"] as const;

export function DeploymentLogs({
  projectId,
  envId,
  deployId,
}: {
  projectId: string;
  envId: string;
  deployId: string;
}) {
  const [historicalLogs, setHistoricalLogs] = useState<DeploymentLogPayload[]>([]);
  const url = `/api/projects/${projectId}/environments/${envId}/deployments/${deployId}/logs/stream`;
  const { data: streamLogs, connected } = useSse<DeploymentLogPayload>(url);

  useEffect(() => {
    api<Array<{ phase: string; level: string; message: string }>>(
      `/api/projects/${projectId}/environments/${envId}/deployments/${deployId}/logs`,
    )
      .then((logs) =>
        setHistoricalLogs(
          logs.map((l) => ({
            phase: l.phase as DeploymentPhase,
            level: l.level,
            message: l.message,
          })),
        ),
      )
      .catch(() => {});
  }, [projectId, envId, deployId]);

  const allLogs = useMemo(() => {
    const seen = new Set<string>();
    return [...historicalLogs, ...streamLogs].filter((l) => {
      const key = `${l.phase}:${l.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [historicalLogs, streamLogs]);

  const [activePhase, setActivePhase] = useState<(typeof PHASES)[number]>("PULUMI");

  const filtered = useMemo(
    () => allLogs.filter((l) => l.phase === activePhase),
    [allLogs, activePhase],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            connected ? "bg-success" : "bg-destructive",
          )}
        />
        <span className="text-sm text-muted-foreground">
          {connected ? "Live" : "Disconnected"}
        </span>
      </div>

      <div className="flex gap-1 border-b border-border">
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => setActivePhase(phase)}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              activePhase === phase
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {phase.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="h-96 overflow-y-auto rounded-lg border border-border bg-background p-4 font-mono text-xs">
        {filtered.map((log, i) => (
          <div
            key={i}
            className={cn(
              "py-0.5",
              log.level === "error" && "text-destructive",
              log.level === "info" && "text-foreground/90",
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
