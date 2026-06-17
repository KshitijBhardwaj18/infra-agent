"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitCommitHorizontal,
  Loader2,
  Microscope,
  RadarIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useIncidentUpdate } from "@/hooks/useWebSocket";
import type { IncidentAnalysis } from "@heizen/shared";

type Severity = "CRITICAL" | "WARNING" | "INFO";
type Status = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
type Source =
  | "HEALTHCHECK"
  | "AGENT"
  | "MANUAL"
  | "DEPLOYMENT"
  | "LOGS"
  | "METRICS";

interface Incident {
  id: string;
  severity: Severity;
  status: Status;
  source: Source;
  title: string;
  detail: string | null;
  suggestedRemedy: string | null;
  analysis: IncidentAnalysis | null;
  occurrences: number;
  lastSeenAt: string;
  createdAt: string;
  resolvedAt: string | null;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: "border-destructive/40 bg-destructive/10 text-destructive",
  WARNING: "border-warning/40 bg-warning/10 text-warning-foreground",
  INFO: "border-info/40 bg-info/10 text-info",
};

const SOURCE_LABEL: Record<Source, string> = {
  HEALTHCHECK: "Health check",
  AGENT: "Agent",
  MANUAL: "Manual",
  DEPLOYMENT: "Deployment",
  LOGS: "App logs",
  METRICS: "Metrics",
};

const CONFIDENCE_STYLES: Record<IncidentAnalysis["confidence"], string> = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning-foreground",
  low: "bg-muted text-muted-foreground",
};

export function IncidentsList({
  projectId,
  envId,
  envStatus,
  canOperate,
  onOpenCountChange,
}: {
  projectId: string;
  envId: string;
  envStatus: string;
  canOperate: boolean;
  onOpenCountChange?: (count: number) => void;
}) {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const base = `/api/projects/${projectId}/environments/${envId}/incidents`;

  const load = useCallback(async () => {
    try {
      const data = await api<Incident[]>(base);
      setIncidents(data);
      onOpenCountChange?.(
        data.filter((i) => i.status !== "RESOLVED").length,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    }
  }, [base, onOpenCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch when the backend broadcasts a change for this env.
  useIncidentUpdate((p) => {
    if (p.environmentId === envId) void load();
  });

  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      const data = await api<Incident[]>(`${base}/scan`, { method: "POST" });
      setIncidents(data);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "The environment must be live to scan for incidents."
          : err instanceof Error
            ? err.message
            : "Scan failed",
      );
    } finally {
      setScanning(false);
    }
  };

  const setStatus = async (id: string, status: Status) => {
    setBusyId(id);
    try {
      await api(`${base}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update incident");
    } finally {
      setBusyId(null);
    }
  };

  const analyze = async (id: string) => {
    setAnalyzingId(id);
    setError(null);
    try {
      await api(`${base}/${id}/analyze`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  };

  const open = (incidents ?? []).filter((i) => i.status !== "RESOLVED");
  const resolved = (incidents ?? []).filter((i) => i.status === "RESOLVED");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Incidents</p>
          <p className="text-xs text-muted-foreground">
            Health probes + Grafana alerts, with agent-suggested remedies.
          </p>
        </div>
        {canOperate && (
          <Button
            size="sm"
            variant="outline"
            onClick={scan}
            disabled={scanning || envStatus !== "LIVE"}
            title={
              envStatus !== "LIVE"
                ? "Environment must be live to scan"
                : "Probe the environment now"
            }
          >
            {scanning ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <RadarIcon size={14} className="mr-1.5" />
            )}
            {scanning ? "Scanning…" : "Scan now"}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {incidents === null ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading incidents…
        </div>
      ) : open.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-10 text-center">
          <ShieldCheck size={22} className="text-success" />
          <p className="text-sm font-medium">No open incidents</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {envStatus === "LIVE"
              ? "This environment looks healthy. Run a scan to check again."
              : "Incidents appear here once the environment is live and monitored."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {open.map((inc) => (
            <IncidentCard
              key={inc.id}
              inc={inc}
              busy={busyId === inc.id}
              analyzing={analyzingId === inc.id}
              canOperate={canOperate}
              onAck={() => setStatus(inc.id, "ACKNOWLEDGED")}
              onResolve={() => setStatus(inc.id, "RESOLVED")}
              onAnalyze={() => analyze(inc.id)}
            />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
            {resolved.length} resolved
          </summary>
          <div className="mt-2 space-y-2.5 opacity-70">
            {resolved.map((inc) => (
              <IncidentCard
                key={inc.id}
                inc={inc}
                busy={busyId === inc.id}
                analyzing={analyzingId === inc.id}
                canOperate={canOperate}
                onAck={() => setStatus(inc.id, "ACKNOWLEDGED")}
                onResolve={() => setStatus(inc.id, "RESOLVED")}
                onAnalyze={() => analyze(inc.id)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function IncidentCard({
  inc,
  busy,
  analyzing,
  canOperate,
  onAck,
  onResolve,
  onAnalyze,
}: {
  inc: Incident;
  busy: boolean;
  analyzing: boolean;
  canOperate: boolean;
  onAck: () => void;
  onResolve: () => void;
  onAnalyze: () => void;
}) {
  const resolved = inc.status === "RESOLVED";
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
              SEVERITY_STYLES[inc.severity],
            )}
          >
            {resolved ? (
              <CheckCircle2 size={13} />
            ) : (
              <AlertTriangle size={13} />
            )}
          </span>
          <div>
            <p className="text-sm font-medium leading-snug">{inc.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-medium",
                  SEVERITY_STYLES[inc.severity],
                )}
              >
                {inc.severity}
              </span>
              <span>·</span>
              <span>{SOURCE_LABEL[inc.source]}</span>
              <span>·</span>
              <span>{new Date(inc.createdAt).toLocaleString()}</span>
              {inc.occurrences > 1 && (
                <>
                  <span>·</span>
                  <span
                    className="rounded bg-muted px-1 py-0.5 font-medium"
                    title={`Seen by ${inc.occurrences} scans — last ${new Date(inc.lastSeenAt).toLocaleString()}`}
                  >
                    ×{inc.occurrences}
                  </span>
                  <span>
                    last seen {new Date(inc.lastSeenAt).toLocaleTimeString()}
                  </span>
                </>
              )}
              {inc.status === "ACKNOWLEDGED" && (
                <>
                  <span>·</span>
                  <span className="text-warning-foreground">acknowledged</span>
                </>
              )}
            </div>
          </div>
        </div>
        {canOperate && !resolved && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onAnalyze}
              disabled={analyzing || busy}
              title="Run root-cause analysis"
            >
              {analyzing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <>
                  <Microscope size={12} className="mr-1" />
                  {inc.analysis ? "Re-analyze" : "Analyze"}
                </>
              )}
            </Button>
            {inc.status === "OPEN" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onAck}
                disabled={busy}
              >
                Ack
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onResolve}
              disabled={busy}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : "Resolve"}
            </Button>
          </div>
        )}
      </div>

      {inc.detail && (
        <p className="mt-2.5 whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {inc.detail}
        </p>
      )}

      {inc.suggestedRemedy && !inc.analysis && (
        <div className="mt-2.5 rounded-md border border-info/20 bg-info/5 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-info">
            <Sparkles size={12} />
            Suggested remedy
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
            {inc.suggestedRemedy}
          </p>
        </div>
      )}

      {inc.analysis && <AnalysisBlock analysis={inc.analysis} />}
    </div>
  );
}

function AnalysisBlock({ analysis }: { analysis: IncidentAnalysis }) {
  return (
    <div className="mt-2.5 rounded-md border border-info/20 bg-info/5 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-info">
          <Microscope size={12} />
          Root-cause analysis
        </div>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            CONFIDENCE_STYLES[analysis.confidence],
          )}
        >
          {analysis.confidence} confidence
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">
        {analysis.summary}
      </p>

      <p className="mt-2 text-[11px] font-medium text-foreground">Probable cause</p>
      <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">
        {analysis.rootCause}
      </p>

      {analysis.correlatedDeploymentId && (
        <div className="mt-2 flex items-center gap-1.5 rounded bg-warning/10 px-2 py-1 text-[11px] text-warning-foreground">
          <GitCommitHorizontal size={12} />
          Correlated with deployment{" "}
          <span className="font-mono">
            {analysis.correlatedDeploymentId.slice(0, 8)}
          </span>
        </div>
      )}

      {analysis.evidence.length > 0 && (
        <>
          <p className="mt-2 text-[11px] font-medium text-foreground">Evidence</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-foreground/80">
            {analysis.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </>
      )}

      {analysis.suggestedActions.length > 0 && (
        <>
          <p className="mt-2 text-[11px] font-medium text-foreground">Next steps</p>
          <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-xs leading-relaxed text-foreground/80">
            {analysis.suggestedActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        Analyzed {new Date(analysis.analyzedAt).toLocaleString()}
      </p>
    </div>
  );
}
