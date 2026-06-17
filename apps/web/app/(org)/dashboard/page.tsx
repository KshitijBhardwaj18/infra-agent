"use client";

import { Suspense, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, FolderGit2, Rocket, Activity, X } from "lucide-react";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { useSession } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { useEnvironmentStatus } from "@/hooks/useWebSocket";

interface Project {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  environments: Array<{
    id: string;
    type: string;
    status: string;
    lastDeployedAt: string | null;
  }>;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function errorCodeToTitle(code: string): string {
  const map: Record<string, string> = {
    github_state_invalid: "GitHub install link expired or invalid",
    github_state_missing: "GitHub install state was missing",
    github_state_expired: "GitHub install link expired — please try connecting again",
    github_install_missing: "GitHub did not return an installation ID",
    github_install_failed: "GitHub install failed",
    github_user_mismatch: "GitHub install was initiated by a different user",
    github_missing_project: "Missing project context",
    github_project_not_found: "Project not found",
    github_forbidden: "You don't have access to this project",
    github_install_admin_only:
      "Only admins can install or change the GitHub App. Pick a repo from the existing connections instead, or ask an admin.",
  };
  return map[code] ?? "GitHub install error";
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageContent />
    </Suspense>
  );
}

const PROJECTS_QUERY_KEY = ["projects"] as const;

function DashboardPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const errorCode = searchParams.get("error");
  const errorReason = searchParams.get("reason");
  const [errorDismissed, setErrorDismissed] = useState(false);

  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api<Project[]>("/api/projects"),
    retry: (failureCount, err) => {
      // 401 → bounce to login, no retry
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return false;
      }
      return failureCount < 2;
    },
  });

  // WebSocket environment-status events patch the cached query data so
  // the dashboard updates live without a full refetch.
  useEnvironmentStatus((payload) => {
    queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (prev) =>
      prev?.map((p) => ({
        ...p,
        environments: p.environments.map((e) =>
          e.id === payload.environmentId ? { ...e, status: payload.status } : e,
        ),
      })),
    );
  });

  const stats = useMemo(() => {
    const liveEnvs = projects.reduce(
      (acc, p) => acc + p.environments.filter((e) => e.status === "LIVE").length,
      0,
    );
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentDeploys = projects.reduce(
      (acc, p) =>
        acc +
        p.environments.filter(
          (e) => e.lastDeployedAt && new Date(e.lastDeployedAt).getTime() > weekAgo,
        ).length,
      0,
    );
    return { total: projects.length, liveEnvs, recentDeploys };
  }, [projects]);

  const recentProjects = projects.slice(0, 3);
  // Bootstrap admin gets name="Heizen Admin" from the env config, which
  // reads as the platform's name not the user's. Prefer the email local
  // part (capitalized) as a more personal greeting when the stored name
  // matches that generic default or is empty.
  const firstName = (() => {
    const raw = session?.user?.name?.split(" ")[0];
    if (raw && raw.toLowerCase() !== "heizen") return raw;
    const emailLocal = session?.user?.email?.split("@")[0];
    if (emailLocal) {
      return emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
    }
    return "there";
  })();

  return (
    <div className="mx-auto max-w-5xl p-6">
      {errorCode && !errorDismissed && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-destructive">
                {errorCodeToTitle(errorCode)}
              </p>
              {errorReason && (
                <p className="mt-1 text-xs text-muted-foreground">{errorReason}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setErrorDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <PageHeader
          title={`${greeting()}, ${firstName}`}
          subtitle="Here's what's happening in your workspace"
          actions={
            <Link href="/projects/new">
              <Button size="sm">
                <Plus size={14} className="mr-2" />
                New project
              </Button>
            </Link>
          }
        />
      </div>

      {loading ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: FolderGit2, value: stats.total, label: "Total projects" },
            { icon: Rocket, value: stats.liveEnvs, label: "Live environments" },
            { icon: Activity, value: stats.recentDeploys, label: "Recent deployments" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card/50 p-4"
            >
              <div className="rounded-md bg-muted p-1.5 w-fit">
                <stat.icon size={14} className="text-muted-foreground" />
              </div>
              <p className="mt-3 tabular-nums text-2xl font-semibold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Recent projects
        </span>
        <div className="flex-1 border-t border-border/30" />
        <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">
          View all
        </Link>
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && recentProjects.length === 0 && (
        <EmptyState
          icon={FolderGit2}
          title="No projects yet"
          description="Create your first project to start deploying"
          action={
            <Link href="/projects/new">
              <Button size="sm">
                <Plus size={14} className="mr-2" />
                Create project
              </Button>
            </Link>
          }
        />
      )}

      {!loading && recentProjects.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
