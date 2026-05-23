"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { useEnvironmentStatus } from "@/hooks/useWebSocket";

interface Project {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-sm text-[var(--muted)]">
              Manage your infrastructure deployments
            </p>
          </div>
          <Link href="/projects/new">
            <Button>
              <Plus size={16} className="mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <Card className="text-center">
            <p className="mb-4 text-[var(--muted)]">No projects yet</p>
            <Link href="/onboarding">
              <Button>Get Started</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.slug}`}>
                <Card className="cursor-pointer transition-colors hover:border-[var(--accent)]">
                  <h3 className="mb-2 font-semibold">{project.name}</h3>
                  <p className="mb-3 text-sm text-[var(--muted)]">
                    {project.githubOwner ? "Connected" : "Not connected"}
                  </p>
                  <div className="flex gap-2">
                    {project.environments.map((env) => (
                      <Badge
                        key={env.id}
                        variant={
                          env.status === "LIVE"
                            ? "success"
                            : env.status === "FAILED"
                              ? "error"
                              : "default"
                        }
                      >
                        {env.type.toLowerCase()}: {env.status.toLowerCase().replace("_", " ")}
                      </Badge>
                    ))}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
