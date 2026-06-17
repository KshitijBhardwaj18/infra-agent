"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { SourceStatus } from "@/components/observability/SourceStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DataSource {
  id: string;
  type: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
}

/**
 * Manage an environment's external observability connections (bring-your-own
 * Grafana/Loki today). The token is write-only — it's encrypted server-side
 * and never returned, so the list shows metadata only.
 */
export function ObservabilitySources({
  projectId,
  envId,
}: {
  projectId: string;
  envId: string;
}) {
  const base = `/api/projects/${projectId}/environments/${envId}/data-sources`;

  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [selector, setSelector] = useState("");
  const [pushUrl, setPushUrl] = useState("");

  // Stale-guard: ignore a load's result if a newer load has started, so a
  // refresh racing with add/remove (or an env switch) can't show stale data.
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const myId = ++loadId.current;
    setLoading(true);
    try {
      const data = await api<DataSource[]>(base);
      if (myId !== loadId.current) return;
      setSources(data);
      setError(null);
    } catch (err) {
      if (myId !== loadId.current) return;
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      if (myId === loadId.current) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !token.trim()) {
      setError("Grafana URL and token are required.");
      return;
    }
    if (!/^https?:\/\/.+/i.test(trimmedUrl)) {
      setError("Grafana URL must start with http:// or https://");
      return;
    }
    const trimmedPush = pushUrl.trim();
    if (trimmedPush && !/^https?:\/\/.+/i.test(trimmedPush)) {
      setError("Loki push URL must start with http:// or https://");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(base, {
        method: "POST",
        body: JSON.stringify({
          type: "grafana-loki",
          displayName: name.trim() || "Grafana / Loki",
          config: {
            url: trimmedUrl,
            token: token.trim(),
            ...(selector.trim() ? { selector: selector.trim() } : {}),
            ...(trimmedPush ? { pushUrl: trimmedPush } : {}),
          },
        }),
      });
      setName("");
      setUrl("");
      setToken("");
      setSelector("");
      setPushUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect source");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    setRemovingIds((prev) => new Set(prev).add(id));
    try {
      await api(`${base}/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove source");
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-lg">
        <SourceStatus projectId={projectId} envId={envId} />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
        <h3 className="text-sm font-medium">Connected sources</h3>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Point Heizen at your own Grafana/Loki to read logs from it. Tokens are
          encrypted at rest and never shown again.
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No sources connected — using built-in logs (CloudWatch on ECS,
            on-box over SSM on EC2).
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm">{s.displayName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {s.type}
                    {s.enabled ? "" : " · disabled"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(s.id)}
                  disabled={removingIds.has(s.id)}
                  aria-label={`Remove ${s.displayName}`}
                >
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
        <h3 className="text-sm font-medium">Connect Grafana / Loki</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Grafana"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Grafana URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-stack.grafana.net"
            />
          </div>
          <div className="space-y-1.5">
            <Label>API token</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="glc_…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Log selector (optional)</Label>
            <Input
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder={'{compose_project="$project"}'}
            />
            <p className="text-xs text-muted-foreground">
              LogQL selector; <span className="font-mono">$project</span> and{" "}
              <span className="font-mono">$env</span> are substituted.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Loki push URL (optional)</Label>
            <Input
              value={pushUrl}
              onChange={(e) => setPushUrl(e.target.value)}
              placeholder="https://logs-prod-xx.grafana.net/loki/api/v1/push"
            />
            <p className="text-xs text-muted-foreground">
              Needed only to let Heizen ship logs here at deploy time
              (Logs destination → My Grafana/Loki).
            </p>
          </div>
          <Button size="sm" onClick={add} disabled={saving}>
            {saving ? "Connecting…" : "Connect"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
