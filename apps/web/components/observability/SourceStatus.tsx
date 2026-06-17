"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface SourceInfo {
  provider: string;
  label: string;
  active: boolean;
  note?: string;
}

interface Sources {
  logs: SourceInfo;
  metrics: SourceInfo;
}

/**
 * Compact strip showing which observability sources actually feed this
 * environment — the resolved providers, not a fetch. Shown on the Incidents
 * page and the Settings → Observability tab so it's never a mystery where
 * incidents and logs come from.
 */
export function SourceStatus({
  projectId,
  envId,
}: {
  projectId: string;
  envId: string;
}) {
  const [data, setData] = useState<Sources | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api<Sources>(`/api/projects/${projectId}/environments/${envId}/sources`, {
      signal: controller.signal,
    })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (active) setData(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, envId]);

  if (!data) return null;

  const note = !data.logs.active ? data.logs.note : undefined;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-xs">
      <span className="font-medium text-muted-foreground">Sources</span>
      <Item label="Logs" info={data.logs} />
      <Item label="Metrics" info={data.metrics} />
      {note && <span className="text-[11px] text-muted-foreground/70">{note}</span>}
    </div>
  );
}

function Item({ label, info }: { label: string; info: SourceInfo }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          info.active ? "bg-success" : "bg-muted-foreground/40"
        }`}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
      <span className={info.active ? "text-foreground" : "text-muted-foreground/60"}>
        {info.label}
      </span>
    </span>
  );
}
