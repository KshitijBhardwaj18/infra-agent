"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, FolderGit2, Rocket, Activity } from "lucide-react";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
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

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Project[]>("/api/projects")
      .then(setProjects)
      .catch((err: Error) => {
        const msg = err.message;
        if (msg.includes("No organization")) {
          router.replace("/onboarding");
        } else if (msg.includes("401")) {
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEnvironmentStatus((payload) => {
    setProjects((prev) =>
      prev.map((p) => ({
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
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening in your workspace
          </p>
        </div>
        <Link href="/projects/new">
          <Button size="sm">
            <Plus size={14} className="mr-2" />
            New project
          </Button>
        </Link>
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
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <stat.icon size={16} className="text-zinc-500" />
              <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-600">
          Recent projects
        </span>
        <div className="flex-1 border-t border-zinc-800/50" />
        <Link href="/projects" className="text-xs text-zinc-500 hover:text-zinc-300">
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-16 text-center">
          <div className="mb-3 rounded-full bg-zinc-900 p-3">
            <FolderGit2 size={20} className="text-zinc-600" />
          </div>
          <p className="text-sm font-medium text-zinc-400">No projects yet</p>
          <p className="mt-1 text-xs text-zinc-600">
            Create your first project to start deploying
          </p>
          <Link href="/projects/new" className="mt-4">
            <Button size="sm">
              <Plus size={14} className="mr-2" />
              Create project
            </Button>
          </Link>
        </div>
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
