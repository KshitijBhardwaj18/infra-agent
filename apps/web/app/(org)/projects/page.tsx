"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, FolderGit2, Search } from "lucide-react";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
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

const PROJECTS_QUERY_KEY = ["projects"] as const;

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api<Project[]>("/api/projects"),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return false;
      }
      if (err instanceof Error && err.message.includes("No organization")) {
        router.replace("/onboarding");
        return false;
      }
      return failureCount < 2;
    },
  });

  // WebSocket status events patch the cached query data so any list
  // showing this query updates live without a refetch.
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
      <div className="mb-6">
        <PageHeader
          title="Projects"
          subtitle={
            loading
              ? "Loading projects..."
              : `${projects.length} project${projects.length !== 1 ? "s" : ""} in your workspace`
          }
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
