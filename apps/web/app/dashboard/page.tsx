"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderGit2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  }>;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Project[]>("/api/projects")
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEnvironmentStatus((payload) => {
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        environments: p.environments.map((e) =>
          e.id === payload.environmentId
            ? { ...e, status: payload.status }
            : e,
        ),
      })),
    );
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Projects</h1>
            {!loading && (
              <p className="text-sm text-muted-foreground">
                {projects.length} project{projects.length !== 1 ? "s" : ""} in your workspace
              </p>
            )}
          </div>
          <Link href="/projects/new">
            <Button size="sm">
              <Plus size={14} className="mr-2" />
              New project
            </Button>
          </Link>
        </div>

        {loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-20 text-center">
            <div className="mb-4 rounded-full bg-zinc-900 p-4">
              <FolderGit2 size={24} className="text-zinc-500" />
            </div>
            <h3 className="mb-1 text-sm font-medium">No projects yet</h3>
            <p className="mb-4 max-w-xs text-sm text-muted-foreground">
              Create your first project to start deploying infrastructure.
            </p>
            <Link href="/projects/new">
              <Button size="sm">
                <Plus size={14} className="mr-2" />
                Create project
              </Button>
            </Link>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
