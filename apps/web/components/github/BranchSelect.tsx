"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Branch {
  name: string;
  protected: boolean;
}

interface Props {
  installationId: string | null | undefined;
  owner: string | null | undefined;
  repo: string | null | undefined;
  value: string;
  onChange: (branch: string) => void;
  fallback?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const BRANCH_NAME_RE = /^[A-Za-z0-9._/\-+]{1,250}$/;

/**
 * Pick the best fallback branch from a non-empty list. Order: caller's
 * preferred fallback, then `main`, then `master`, then the first entry.
 * Pure function — extracted so the revalidate-or-replace step in the fetch
 * effect reads at a single level of abstraction.
 */
function pickFallbackBranch(list: Branch[], preferred?: string): string {
  return (
    list.find((b) => b.name === preferred)?.name ??
    list.find((b) => b.name === "main")?.name ??
    list.find((b) => b.name === "master")?.name ??
    list[0]!.name
  );
}

/**
 * Branch picker for a single GitHub repo accessible via the given installation.
 *
 * Two top-level modes — list (default) and custom (fallback). Composition:
 *   - <BranchListPicker> renders the filter + Select bound to the fetched list
 *   - <CustomBranchInput> renders the freeform input + "Use this branch" button
 * BranchSelect owns ONLY the data fetch + which mode to show; each sub-piece
 * owns its own input state so the top-level state stays small.
 */
export function BranchSelect({
  installationId,
  owner,
  repo,
  value,
  onChange,
  fallback,
  label = "Branch",
  disabled,
  className,
}: Props) {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = list mode; "auto" = fetch failed, we forced custom; "manual" = user
  // clicked the toggle. Tracked so a refetch can clear an "auto" but cannot
  // yank a "manual" mode out from under the user.
  const [customMode, setCustomMode] = useState<null | "auto" | "manual">(null);

  useEffect(() => {
    // Repo identity changed — drop every per-repo piece of state.
    setBranches(null);
    setError(null);
    setCustomMode(null);

    if (!installationId || !owner || !repo) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api<Branch[]>(
      `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?installationId=${encodeURIComponent(installationId)}`,
    )
      .then((list) => {
        if (cancelled) return;
        setBranches(list);
        if (list.length === 0) return;

        // Revalidate-or-replace. `currentExists` is false when value is empty
        // OR set-but-missing-from-the-new-list. In either case, swap in a
        // fallback so the parent never persists a stale selection.
        const currentExists = value && list.some((b) => b.name === value);
        if (!currentExists) {
          onChange(pickFallbackBranch(list, fallback));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load branches");
        setBranches([]);
        setCustomMode("auto");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Refetch only when repo identity changes — value/onChange/fallback are
    // intentionally NOT deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationId, owner, repo]);

  const inCustomMode = customMode !== null;
  const hasList = branches !== null && branches.length > 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>

      {!inCustomMode && (
        <BranchListPicker
          branches={branches}
          loading={loading}
          disabled={disabled}
          value={value}
          onChange={onChange}
        />
      )}

      {inCustomMode && (
        <CustomBranchInput
          initial={value || fallback || ""}
          disabled={disabled}
          onSubmit={(name) => onChange(name)}
          current={value}
        />
      )}

      {!loading && (branches !== null || inCustomMode) && (
        <button
          type="button"
          onClick={() => {
            if (inCustomMode) {
              if (hasList) {
                setCustomMode(null);
                setError(null);
              }
            } else {
              setCustomMode("manual");
            }
          }}
          disabled={disabled || (inCustomMode && !hasList)}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          {inCustomMode
            ? "← Back to the branch list"
            : "Can't find it? Use a custom branch name"}
        </button>
      )}

      {error && (
        <p className="text-xs text-destructive">
          {error}. Enter the branch name and click &ldquo;Use this branch&rdquo;.
        </p>
      )}
    </div>
  );
}

// ─── List mode ─────────────────────────────────────────────────────────────
function BranchListPicker({
  branches,
  loading,
  disabled,
  value,
  onChange,
}: {
  branches: Branch[] | null;
  loading: boolean;
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const [filter, setFilter] = useState("");
  // Reset the filter whenever the underlying list identity changes — i.e.,
  // a new repo's branches came in. Saves the caller a prop.
  useEffect(() => {
    setFilter("");
  }, [branches]);

  const visible = useMemo(() => {
    if (!branches) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, filter]);

  return (
    <div className="space-y-1.5">
      <Input
        placeholder={loading ? "Loading branches…" : "Filter branches…"}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={disabled || loading}
        className="h-8 text-xs"
      />
      <Select
        // Always pass a string (never undefined) so base-ui's Select stays
        // controlled across renders. When value is "" no SelectItem matches
        // and the placeholder shows — same UX as 'no selection', without
        // the controlled/uncontrolled flip warning.
        value={value}
        onValueChange={(v) => v && onChange(v)}
        disabled={disabled || loading}
      >
        <SelectTrigger className="h-9">
          <SelectValue
            placeholder={
              loading
                ? "Loading…"
                : branches && branches.length === 0
                  ? "No branches"
                  : "Pick a branch"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {visible.map((b) => (
            <SelectItem key={b.name} value={b.name}>
              <span className="font-mono text-xs">{b.name}</span>
              {b.protected && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  protected
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Custom mode ───────────────────────────────────────────────────────────
function CustomBranchInput({
  initial,
  current,
  disabled,
  onSubmit,
}: {
  initial: string;
  current: string;
  disabled?: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  // If the parent's value changes (e.g. caller cleared it), keep the input in
  // sync without remounting.
  useEffect(() => {
    setName(initial);
  }, [initial]);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && BRANCH_NAME_RE.test(trimmed);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="branch-name"
          disabled={disabled}
          className="h-8 text-xs font-mono"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => valid && onSubmit(trimmed)}
          disabled={disabled || !valid}
        >
          Use this branch
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Current: <code className="font-mono">{current || "(none)"}</code>
      </p>
    </div>
  );
}
