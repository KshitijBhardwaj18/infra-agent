"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Roll an environment back to its previous good commit. Two-step (confirm)
 * because it triggers a real redeploy; the backend runs it through the
 * normal deploy path with all the usual guards.
 */
export function RollbackButton({
  projectId,
  envId,
}: {
  projectId: string;
  envId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Abort an in-flight rollback if the component unmounts, so we don't set
  // state on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await api(
        `/api/projects/${projectId}/environments/${envId}/deployments/rollback`,
        { method: "POST", signal: abort.signal },
      );
      setMsg("Rollback queued — redeploying the previous good commit.");
      setConfirming(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMsg(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <Button size="sm" variant="destructive" onClick={run} disabled={busy}>
            {busy ? "Rolling back…" : "Confirm rollback"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMsg(null);
            setConfirming(true);
          }}
        >
          <RotateCcw size={14} className="mr-2" />
          Roll back to last good
        </Button>
      )}
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
