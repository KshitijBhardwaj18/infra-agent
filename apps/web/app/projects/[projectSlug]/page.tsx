"use client";

import { use, useEffect, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useProject, PROJECTS_QUERY_KEY } from "@/hooks/useProject";
import { useRouter } from "next/navigation";
import {
  Rocket,
  TestTube2,
  Boxes,
  Plus,
  Trash2,
  ChevronDown,
  ArrowRight,
  History,
} from "lucide-react";
import { NewEnvironmentModal } from "@/components/projects/NewEnvironmentModal";
import { envSlugOf, envNameOf } from "@/lib/env-display";
import { api } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, StatusDot } from "@/components/ui/status-badge";
import { KindBadge } from "@/components/ui/kind-badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { timeAgo, formatDuration } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  environments: Array<{
    id: string;
    type: string;
    name: string | null;
    slug: string | null;
    tier: "STAGING" | "PRODUCTION" | null;
    status: string;
    lastDeployedAt: string | null;
    heizenConfig: unknown | null;
  }>;
}

interface DeploymentRow {
  id: string;
  status: string;
  kind: "DEPLOY" | "DESTROY";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  envSlug: string;
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { projectSlug } = use(params);
  const { project, loading: projectLoading } = useProject(projectSlug);
  const [showNewEnv, setShowNewEnv] = useState(false);
  const [deletingEnvId, setDeletingEnvId] = useState<string | null>(null);

  const deleteEnv = async (envId: string, envName: string) => {
    if (!project) return;
    if (
      !window.confirm(
        `Delete the "${envName}" environment? This can't be undone.`,
      )
    ) {
      return;
    }
    setDeletingEnvId(envId);
    try {
      await api(`/api/projects/${project.id}/environments/${envId}`, {
        method: "DELETE",
      });
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to delete environment.",
      );
    } finally {
      setDeletingEnvId(null);
    }
  };

  // The sidebar's "New environment" links here with ?new-env=1.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("new-env") === "1"
    ) {
      setShowNewEnv(true);
    }
  }, []);

  // One query per environment — useQueries runs them in parallel and
  // each gets its own cache slot keyed by env.id so navigating away
  // and back doesn't re-fetch.
  const envQueries = useQueries({
    queries: (project?.environments ?? []).map((env) => ({
      queryKey: ["deployments", project?.id, env.id] as const,
      queryFn: () =>
        api<
          Array<{
            id: string;
            status: string;
            kind: "DEPLOY" | "DESTROY";
            createdAt: string;
            startedAt: string | null;
            completedAt: string | null;
          }>
        >(`/api/projects/${project!.id}/environments/${env.id}/deployments`),
      enabled: !!project,
      staleTime: 60_000,
    })),
  });

  const envLoading = envQueries.some((q) => q.isLoading);
  const loading = projectLoading || (!!project && envLoading);

  // Flatten the per-env lists and tag each row with its envSlug, then
  // sort by createdAt and keep the most recent 5.
  const deployments: DeploymentRow[] = (() => {
    if (!project) return [];
    const all: DeploymentRow[] = [];
    project.environments.forEach((env, idx) => {
      const data = envQueries[idx]?.data ?? [];
      for (const d of data) {
        all.push({
          ...d,
          // Older rows may lack `kind` (added later); default to DEPLOY
          // so the badge renders without crashing.
          kind: d.kind ?? "DEPLOY",
          // The env's real slug so deployment links resolve for custom envs
          // (not env.type, which is "custom" for all of them).
          envSlug: envSlugOf(env),
        });
      }
    });
    all.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return all.slice(0, 5);
  })();

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  // Single label for the env card's primary button, routed by status so
  // it stays in sync with what the env detail page actually shows. Must
  // cover every EnvironmentStatus — falling through to "Configure" for an
  // in-flight or failed env (as it used to) was misleading.
  const envAction = (env: Project["environments"][0]) => {
    switch (env.status) {
      case "LIVE":
        return "Open";
      case "DEPLOYING":
      case "DESTROYING":
        return "View progress";
      case "FAILED":
        return "View error";
      case "DESTROYED":
        return "Redeploy";
      default:
        // NOT_DEPLOYED
        return env.heizenConfig ? "Configure" : "Set up";
    }
  };

  // The secondary "Deploy" shortcut only makes sense when the env is
  // idle. Hidden during DEPLOYING/DESTROYING (would start a second op the
  // API rejects) and during FAILED — a failed run needs kind-aware
  // recovery (a failed *destroy* must not offer redeploy), which only the
  // env detail page knows. The FAILED card routes there via "View error".
  const canQuickDeploy = (env: Project["environments"][0]) =>
    env.heizenConfig != null &&
    env.status !== "DEPLOYING" &&
    env.status !== "DESTROYING" &&
    env.status !== "FAILED";

  return (
    <div className="mx-auto max-w-5xl p-6">
      {showNewEnv && (
        <NewEnvironmentModal
          projectId={project.id}
          projectSlug={project.slug}
          onClose={() => setShowNewEnv(false)}
        />
      )}
      <div className="mb-6">
        <PageHeader
          title={project.name}
          subtitle={
            project.githubOwner
              ? `${project.githubOwner}/${project.githubRepo} · ${project.githubBranch ?? "main"}`
              : "GitHub not connected"
          }
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ size: "sm" })}>
                Deploy
                <ChevronDown size={14} className="ml-1" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {project.environments.map((env) => (
                  <DropdownMenuItem
                    key={env.id}
                    onClick={() =>
                      router.push(`/projects/${project.slug}/${envSlugOf(env)}`)
                    }
                  >
                    Deploy to {envNameOf(env)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => setShowNewEnv(true)}>
                  <Plus size={14} className="mr-1.5" /> New environment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Environments
        </span>
        <div className="flex-1 border-t border-border/50" />
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {project.environments.map((env) => {
          const Icon =
            env.type === "CUSTOM"
              ? Boxes
              : (env.tier ?? env.type) === "PRODUCTION"
                ? Rocket
                : TestTube2;
          const slug = envSlugOf(env);
          return (
            <div
              key={env.id}
              className="rounded-lg border border-border bg-card/50 p-4 transition-colors hover:border-foreground/20"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={15} className="text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">
                    {envNameOf(env)}
                  </span>
                </div>
                <StatusBadge status={env.status} />
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {env.lastDeployedAt
                  ? `Last deployed ${timeAgo(env.lastDeployedAt)}`
                  : "Never deployed"}
              </p>
              <div className="flex gap-2">
                <Link href={`/projects/${project.slug}/${slug}`}>
                  <Button size="sm" variant="outline">
                    {envAction(env)}
                  </Button>
                </Link>
                {canQuickDeploy(env) && (
                  <Link href={`/projects/${project.slug}/${slug}`}>
                    <Button size="sm">
                      {env.status === "LIVE" ? "Redeploy" : "Deploy"}
                    </Button>
                  </Link>
                )}
                {env.type === "CUSTOM" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteEnv(env.id, envNameOf(env))}
                    disabled={deletingEnvId === env.id}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${envNameOf(env)}`}
                    title="Delete environment"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Recent deployments
        </span>
        <div className="flex-1 border-t border-border/50" />
      </div>

      {deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <History size={20} className="text-muted-foreground/70" />
          <p className="mt-3 text-sm text-muted-foreground">No deployments yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {deployments.map((d) => (
            <Link
              key={d.id}
              href={`/projects/${project.slug}/${d.envSlug}/deployments/${d.id}`}
              className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-card/50"
            >
              <StatusDot status={d.status} />
              <KindBadge kind={d.kind} />
              <span className="text-sm capitalize text-foreground/90">{d.envSlug}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(d.createdAt)}</span>
              <span className="text-xs text-muted-foreground/70">
                {formatDuration(d.startedAt ?? d.createdAt, d.completedAt)}
              </span>
              <ArrowRight size={14} className="ml-auto text-muted-foreground/70" />
            </Link>
          ))}
          <Link
            href={`/projects/${project.slug}/deployments`}
            className="block px-4 py-3 text-xs text-muted-foreground hover:text-foreground"
          >
            View all deployments →
          </Link>
        </div>
      )}
    </div>
  );
}
