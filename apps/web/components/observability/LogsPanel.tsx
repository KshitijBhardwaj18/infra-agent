"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Loader2,
  Microscope,
  RefreshCw,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import type { LogsResponse, LogAnalysis } from "@heizen/shared";

const WINDOWS = [
  { label: "15 min", value: 15 },
  { label: "1 hour", value: 60 },
  { label: "6 hours", value: 360 },
] as const;

const HEALTH_STYLES: Record<LogAnalysis["health"], string> = {
  healthy: "bg-success/15 text-success",
  degraded: "bg-warning/15 text-warning-foreground",
  down: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

export function LogsPanel({
  projectId,
  envId,
  services,
  canOperate,
  autoRefresh = false,
}: {
  projectId: string;
  envId: string;
  services: string[];
  canOperate: boolean;
  /** Poll the window every 20s while the tab is visible (live mode). */
  autoRefresh?: boolean;
}) {
  const [service, setService] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(30);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/projects/${projectId}/environments/${envId}/logs`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (service) params.set("service", service);
      params.set("minutes", String(minutes));
      const res = await api<LogsResponse>(`${base}?${params}`);
      setData(res);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [base, service, minutes]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20_000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api<LogAnalysis>(`${base}/analyze`, {
        method: "POST",
        body: JSON.stringify({
          service: service || undefined,
          minutes,
        }),
      });
      setAnalysis(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="h-8 w-40 text-sm"
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={String(minutes)}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="h-8 w-28 text-sm"
        >
          {WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </Button>
        <div className="flex-1" />
        {canOperate && (
          <Button size="sm" onClick={analyze} disabled={analyzing || loading}>
            {analyzing ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Microscope size={14} className="mr-1.5" />
            )}
            {analyzing ? "Analyzing…" : "Analyze logs"}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Analysis verdict */}
      {analysis && (
        <div className="rounded-lg border border-info/20 bg-info/5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-info">
              <Microscope size={13} />
              Log analysis — last {analysis.windowMinutes} min
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                HEALTH_STYLES[analysis.health],
              )}
            >
              {analysis.health}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground/90">
            {analysis.summary}
          </p>

          {analysis.issues.length > 0 && (
            <div className="mt-2.5 space-y-1.5">
              {analysis.issues.map((issue, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-background/60 px-2.5 py-2"
                >
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle
                      size={11}
                      className={
                        issue.severity === "CRITICAL"
                          ? "text-destructive"
                          : issue.severity === "WARNING"
                            ? "text-warning-foreground"
                            : "text-info"
                      }
                    />
                    <span className="text-xs font-medium">{issue.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {issue.likelyCause}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
                    {issue.evidence}
                  </p>
                </div>
              ))}
            </div>
          )}

          {analysis.slownessIndicators.length > 0 && (
            <>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-warning-foreground">
                <Timer size={12} />
                Slowness indicators
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground/80">
                {analysis.slownessIndicators.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {analysis.recommendedActions.length > 0 && (
            <>
              <p className="mt-2.5 text-[11px] font-medium text-foreground">
                Recommended actions
              </p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-foreground/80">
                {analysis.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {/* Stats strip */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Activity size={13} />
          <span>{data.stats.total} lines</span>
          <span>·</span>
          <span className={data.stats.errors > 0 ? "text-destructive" : ""}>
            {data.stats.errors} errors
          </span>
          <span>·</span>
          <span
            className={data.stats.warns > 0 ? "text-warning-foreground" : ""}
          >
            {data.stats.warns} warnings
          </span>
          <span>·</span>
          <Badge variant="outline" className="text-[10px]">
            {data.source === "loki"
              ? "Grafana Loki"
              : data.source === "cloudwatch"
                ? "CloudWatch"
                : "On-box (SSM)"}
          </Badge>
          {data.truncated && (
            <span className="text-[10px]">(truncated window)</span>
          )}
        </div>
      )}

      {/* Top clusters */}
      {data && data.stats.clusters.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recurring problems
          </p>
          {data.stats.clusters.slice(0, 5).map((c) => (
            <div
              key={c.signature}
              className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
            >
              <span
                className={cn(
                  "mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  c.level === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/10 text-warning-foreground",
                )}
              >
                ×{c.count}
              </span>
              <code className="break-all font-mono text-[11px] leading-relaxed text-foreground/80">
                {c.sample}
              </code>
            </div>
          ))}
        </div>
      )}

      {/* Log lines (newest first) */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Log lines — newest first</span>
          {autoRefresh && (
            <span className="flex items-center gap-1.5 normal-case tracking-normal">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              live
            </span>
          )}
        </div>
        <div className="max-h-96 overflow-auto p-2">
          {loading && !data ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading logs…
            </div>
          ) : !data || data.lines.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No log lines in this window.
            </p>
          ) : (
            data.lines.map((l, i) => (
              <div
                key={i}
                className="flex gap-2 border-b border-border/40 px-1 py-0.5 font-mono text-[11px] leading-relaxed last:border-0"
              >
                <span className="shrink-0 text-muted-foreground/70">
                  {l.ts ? new Date(l.ts).toLocaleTimeString() : "--:--:--"}
                </span>
                {l.service && (
                  <span className="shrink-0 text-info/80">{l.service}</span>
                )}
                <span className="break-all text-foreground/85">{l.line}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
