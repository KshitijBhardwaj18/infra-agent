"use client";

import { useState, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api";

const ACTION_LABELS: Record<string, string> = {
  DEPLOY_TRIGGERED: "Deploy triggered",
  ENV_VARS_REPLACED: "Env vars replaced",
  GITHUB_CONNECTION_ADDED: "GitHub connection added",
  GITHUB_CONNECTION_REMOVED: "GitHub connection removed",
  USER_CREATED: "User created",
  USER_ROLE_CHANGED: "User role changed",
  USER_DELETED: "User deleted",
  PROJECT_DELETED: "Project deleted",
  PROJECT_MEMBER_ADDED: "Member added",
  PROJECT_MEMBER_ROLE_CHANGED: "Member role changed",
  PROJECT_MEMBER_REMOVED: "Member removed",
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

const ALL_RESOURCE_TYPES = [
  "PROJECT",
  "ENVIRONMENT",
  "USER",
  "GITHUB_CONNECTION",
  "PROJECT_MEMBER",
] as const;

interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [filterAction, setFilterAction] = useState<string>("__all__");
  const [filterResourceType, setFilterResourceType] = useState<string>("__all__");

  // queryKey includes the filters so React Query caches one infinite
  // list per filter combination. Switching filters and switching back
  // hits the cache, no refetch.
  const queryKey = [
    "admin",
    "audit-log",
    { action: filterAction, resourceType: filterResourceType },
  ] as const;

  const {
    data,
    isLoading: loading,
    isFetchingNextPage: loadingMore,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(pageParam),
      });
      if (filterAction !== "__all__") params.set("action", filterAction);
      if (filterResourceType !== "__all__")
        params.set("resourceType", filterResourceType);
      return api<AuditLogEntry[]>(`/api/admin/audit-log?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Backend returns at most PAGE_SIZE; a short page signals end.
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, p) => sum + p.length, 0);
    },
    staleTime: 30 * 1000, // shorter than the default — audit data ages.
  });

  // Surface fetch errors as a toast (only on the first failure to avoid
  // re-toasting on retries).
  useMemo(() => {
    if (error) toast.error("Failed to load audit log");
  }, [error]);

  const entries = data?.pages.flat() ?? [];
  const hasMore = hasNextPage ?? false;

  function clearFilters() {
    setFilterAction("__all__");
    setFilterResourceType("__all__");
  }

  const load = (reset: boolean) => {
    if (!reset && hasMore) void fetchNextPage();
    // 'reset' is implicit — filters as part of queryKey re-trigger a new query
  };

  const hasFilters = filterAction !== "__all__" || filterResourceType !== "__all__";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        subtitle="Sensitive changes to projects, users, and connections"
      />

      <div className="flex items-center gap-2">
        <Select value={filterAction} onValueChange={(v) => setFilterAction(v ?? "__all__")}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All actions</SelectItem>
            {ALL_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterResourceType} onValueChange={(v) => setFilterResourceType(v ?? "__all__")}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All resources</SelectItem>
            {ALL_RESOURCE_TYPES.map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <EmptyState icon={ScrollText} title="No audit log entries" />
      )}

      {!loading && entries.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Time</TableHead>
                <TableHead className="w-44">Actor</TableHead>
                <TableHead className="w-52">Action</TableHead>
                <TableHead className="w-48">Resource</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {relativeTime(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    {entry.actor ? (
                      <div>
                        <div className="text-sm font-medium">{entry.actor.name}</div>
                        <div className="text-xs text-muted-foreground">{entry.actor.email}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">system</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    <span className="truncate block max-w-[180px]">
                      {entry.resourceType}
                      {entry.resourceId ? `:${entry.resourceId}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    {entry.metadata ? (
                      <pre
                        className="text-xs text-muted-foreground overflow-hidden max-h-10 hover:max-h-none transition-all cursor-pointer whitespace-pre-wrap break-all"
                        title="Click to expand"
                      >
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(false)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
