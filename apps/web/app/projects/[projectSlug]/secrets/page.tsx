"use client";

import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useProject } from "@/hooks/useProject";
import { Eye, EyeOff, Copy, Pencil, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { HeizenConfig, ParsedEntry } from "@heizen/shared";
import { parseDotenv, serializeDotenv } from "@heizen/shared";

function getAutoInjectedKeys(
  config: HeizenConfig | null,
): Array<{ key: string; description: string; active: boolean }> {
  const hasPostgres = config?.database.engine === "postgres";
  const hasRedis = config?.cache.engine === "redis";
  const hasStorage = config?.storage.enabled ?? false;

  return [
    {
      key: "DATABASE_URL",
      active: hasPostgres,
      description: hasPostgres
        ? "Postgres enabled — built from your RDS endpoint + credentials"
        : "Injected when Postgres is enabled in your stack",
    },
    {
      key: "REDIS_URL",
      active: hasRedis,
      description: hasRedis
        ? "Redis enabled — built from your ElastiCache endpoint"
        : "Injected when Redis is enabled in your stack",
    },
    {
      key: "AWS_S3_BUCKET",
      active: hasStorage,
      description: hasStorage
        ? "S3 storage enabled — your bucket name"
        : "Injected when S3 storage is enabled in your stack",
    },
    {
      key: "NODE_ENV",
      active: true,
      description: 'Always set to "production"',
    },
  ];
}

interface Project {
  id: string;
  slug: string;
  environments: Array<{ id: string; type: string; heizenConfig: HeizenConfig | null }>;
}

function SecretsContent() {
  const params = useParams<{ projectSlug: string }>();
  const { project, loading } = useProject(params.projectSlug);
  const [activeEnv, setActiveEnv] = useState<string>("PRODUCTION");

  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);

  const activeEnvironment = project?.environments.find((e) => e.type === activeEnv);
  // useProject types this as `unknown`; the API guarantees the shape
  // (HeizenConfig | null), so cast at the consumption boundary.
  const heizenConfig = (activeEnvironment?.heizenConfig as HeizenConfig | null | undefined) ?? null;
  const autoInjectedKeys = getAutoInjectedKeys(heizenConfig);

  const liveParseResult = editing ? parseDotenv(draftText) : null;
  const parseErrors = liveParseResult?.errors ?? [];
  const parseWarnings = liveParseResult?.warnings ?? [];

  const envOptions = project?.environments.map((e) => e.type) ?? ["PRODUCTION", "STAGING"];

  const activeEnvObj = project?.environments.find((e) => e.type === activeEnv);

  // Per-env raw secrets. Cache key includes env id so switching tabs
  // doesn't refetch what was already loaded.
  const rawQuery = useQuery({
    queryKey: ["env-vars-raw", project?.id, activeEnvObj?.id] as const,
    queryFn: () =>
      api<Array<{ key: string; value: string }>>(
        `/api/projects/${project!.id}/environments/${activeEnvObj!.id}/env-vars/raw`,
      ),
    enabled: !!project && !!activeEnvObj,
    staleTime: 30 * 1000,
  });
  const entries: ParsedEntry[] = rawQuery.data ?? [];
  const rawLoading = rawQuery.isLoading;

  const handleEnvChange = (val: string | null) => {
    if (!val) return;
    setActiveEnv(val);
    setEditing(false);
    setRevealed(false);
  };

  const handleCopy = async () => {
    try {
      const text = serializeDotenv(entries);
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Unable to copy secrets to clipboard");
    }
  };

  const handleEditStart = () => {
    setDraftText(serializeDotenv(entries));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraftText("");
  };

  const handleSave = async () => {
    if (!project || !activeEnvironment) return;
    setSaving(true);
    try {
      await api(
        `/api/projects/${project.id}/environments/${activeEnvironment.id}/env-vars/raw`,
        { method: "PUT", body: JSON.stringify({ content: draftText }) },
      );
      // Refetch the raw secrets via React Query rather than the old
      // fetchRaw helper — keeps the cache the source of truth.
      await rawQuery.refetch();
      toast.success("Secrets updated successfully");
      setEditing(false);
      setDraftText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save secrets");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const envSelectEl = (
    <Select value={activeEnv} onValueChange={handleEnvChange}>
      <SelectTrigger className="h-8 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {envOptions.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">
            {opt.charAt(0) + opt.slice(1).toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const editorActions = (
    <div className="flex items-center gap-1">
      {rawLoading && (
        <div className="mr-1 h-3 w-3 animate-spin rounded-full border border-border border-t-foreground/90" />
      )}
      {!editing && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? "Hide values" : "Reveal values"}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            aria-label="Copy as .env"
            disabled={entries.length === 0}
          >
            <Copy size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleEditStart}
            aria-label="Edit secrets"
          >
            <Pencil size={14} />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <PageHeader
        title="Project Secrets"
        subtitle="Manage all your project secrets"
        actions={
          <div className="flex items-center gap-2">
            {envSelectEl}
          </div>
        }
      />

      {/* Info callout */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
        <Zap size={14} className="mt-0.5 shrink-0 text-info" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Secrets are encrypted and injected as environment variables into all
          ECS containers at deploy time. Your app reads them via{" "}
          <code className="text-foreground/90">process.env.KEY_NAME</code>.
        </p>
      </div>

      {/* Auto-injected */}
      <section className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Auto-injected by Heizen
        </p>
        <div className="rounded-lg border border-border bg-card/30 px-4 py-3">
          <p className="mb-3 text-xs text-muted-foreground">
            {heizenConfig
              ? "Injected at deploy time based on your stack — only keys that apply to this environment are set."
              : "After indexing your codebase, Heizen injects variables that match your stack (Postgres, Redis, S3, etc.)."}
          </p>
          <div className="space-y-2">
            {autoInjectedKeys.map((item) => (
              <div
                key={item.key}
                className={cn(
                  "flex items-start justify-between gap-4 rounded-md px-2 py-1.5",
                  item.active ? "bg-card/40" : "opacity-60",
                )}
              >
                <code className="shrink-0 font-mono text-xs font-medium text-foreground">
                  {item.key}
                </code>
                <span className="text-right text-xs text-muted-foreground">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* User secrets editor */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground/90">
            {activeEnv.charAt(0) + activeEnv.slice(1).toLowerCase()} Secrets
          </p>
          {editorActions}
        </div>

        {editing ? (
          <div className="space-y-2">
            {parseErrors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parseErrors.map((err) => (
                  <Badge
                    key={`${err.line}-${err.message}`}
                    variant="outline"
                    className="border-destructive/40 text-[11px] text-destructive"
                  >
                    Line {err.line}: {err.message}
                  </Badge>
                ))}
              </div>
            )}
            {parseWarnings.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parseWarnings.map((msg) => (
                  <Badge
                    key={msg}
                    variant="outline"
                    className="border-warning/40 text-[11px] text-warning-foreground"
                  >
                    {msg}
                  </Badge>
                ))}
              </div>
            )}
            <Textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder={"DATABASE_URL=postgres://...\nREDIS_URL=redis://...\nAPI_KEY=your-key"}
              className="min-h-[240px] font-mono text-xs leading-relaxed"
              spellCheck={false}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || parseErrors.length > 0}
                className="gap-1.5"
              >
                {saving ? "Saving..." : (
                  <>
                    <Check size={13} /> Save Changes
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-card p-4 font-mono text-xs leading-relaxed overflow-x-auto">
            {entries.length === 0 ? (
              <p className="text-muted-foreground">
                No secrets set. Click the pencil icon to add your first secret.
              </p>
            ) : (
              <pre className="m-0">
                {entries.map((entry, idx) => (
                  <div key={entry.key} className="flex">
                    <span className="select-none mr-3 text-muted-foreground/60 w-6 text-right shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-foreground">
                      {entry.key}
                      <span className="text-muted-foreground">=</span>
                      {revealed ? entry.value : "••••••••"}
                    </span>
                  </div>
                ))}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default function SecretsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl space-y-4 p-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      }
    >
      <SecretsContent />
    </Suspense>
  );
}
