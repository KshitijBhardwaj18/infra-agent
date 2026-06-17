"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, History } from "lucide-react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { KindBadge } from "@/components/ui/kind-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { timeAgo, formatDuration } from "@/lib/format";

interface Deployment {
  id: string;
  /** "DEPLOY" runs ran `pulumi up`. "DESTROY" runs ran `pulumi destroy`.
   *  Older rows that pre-date the kind column default to DEPLOY at
   *  the API/Prisma layer. */
  kind: "DEPLOY" | "DESTROY";
  status: string;
  commitSha: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  environmentType: string;
  envSlug: string;
  envId: string;
}

type Filter = "all" | "production" | "staging" | "active" | "failed";

export default function DeploymentsListPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const router = useRouter();
  const [projectSlug, setProjectSlug] = useState("");
  const [projectId, setProjectId] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    params.then(async ({ projectSlug: slug }) => {
      setProjectSlug(slug);
      const projects = await api<
        Array<{
          id: string;
          slug: string;
          environments: Array<{ id: string; type: string }>;
        }>
      >("/api/projects");
      const project = projects.find((p) => p.slug === slug);
      if (!project) {
        setLoading(false);
        return;
      }
      setProjectId(project.id);

      const all: Deployment[] = [];
      for (const env of project.environments) {
        const list = await api<
          Array<{
            id: string;
            kind?: "DEPLOY" | "DESTROY";
            status: string;
            commitSha: string | null;
            createdAt: string;
            startedAt: string | null;
            completedAt: string | null;
          }>
        >(`/api/projects/${project.id}/environments/${env.id}/deployments`);
        for (const d of list) {
          all.push({
            ...d,
            kind: d.kind ?? "DEPLOY",
            environmentType: env.type,
            envSlug: env.type.toLowerCase(),
            envId: env.id,
          });
        }
      }
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDeployments(all);
      setLoading(false);
    });
  }, [params]);

  const filtered = useMemo(() => {
    return deployments.filter((d) => {
      if (filter === "production") return d.environmentType === "PRODUCTION";
      if (filter === "staging") return d.environmentType === "STAGING";
      if (filter === "active")
        return !["SUCCESS", "FAILED", "CANCELLED"].includes(d.status);
      if (filter === "failed") return d.status === "FAILED";
      return true;
    });
  }, [deployments, filter]);

  const filters: Filter[] = ["all", "production", "staging", "active", "failed"];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <PageHeader
          title="Deployments"
          subtitle="Recent deploys across all environments"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs capitalize transition-colors",
              filter === f
                ? "border-foreground/20 bg-muted text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground/90",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={History}
          title="No runs yet"
          description="Deploy or tear down an environment to see runs here"
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Environment</th>
                <th className="px-4 py-2 font-medium">Commit</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() =>
                    router.push(
                      `/projects/${projectSlug}/${d.envSlug}/deployments/${d.id}`,
                    )
                  }
                  className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-card/50"
                >
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    <KindBadge kind={d.kind} />
                  </td>
                  <td className="px-4 py-3 capitalize text-foreground/90">{d.envSlug}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {d.commitSha?.slice(0, 7) ?? "—"}
                  </td>
                  <td className="tabular-nums px-4 py-3 text-muted-foreground">
                    {formatDuration(d.startedAt ?? d.createdAt, d.completedAt)}
                  </td>
                  <td className="tabular-nums px-4 py-3 text-muted-foreground">{timeAgo(d.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <ArrowRight size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
