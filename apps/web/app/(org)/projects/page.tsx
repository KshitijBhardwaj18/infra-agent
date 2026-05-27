"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, FolderGit2, Search } from "lucide-react";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
  }>;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api<Project[]>("/api/projects")
      .then(setProjects)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else if (err instanceof Error && err.message.includes("No organization")) {
          router.replace("/onboarding");
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

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        `${p.githubOwner}/${p.githubRepo}`.toLowerCase().includes(q),
    );
  }, [projects, query]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">Projects</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading
              ? "Loading projects..."
              : <span className="tabular-nums">{projects.length} project{projects.length !== 1 ? "s" : ""} in your workspace</span>}
          </p>
        </div>
        <Link href="/projects/new">
          <Button size="sm">
            <Plus size={14} className="mr-2" />
            New project
          </Button>
        </Link>
      </div>

      {!loading && projects.length > 0 && (
        <div className="relative mb-6 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <EmptyState
          icon={FolderGit2}
          title="No projects yet"
          description="Create your first project to start deploying infrastructure"
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

      {!loading && projects.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title="No matching projects"
          description="Try a different search term"
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
