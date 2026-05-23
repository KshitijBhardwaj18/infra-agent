"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";

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

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    params.then(async ({ projectSlug }) => {
      const projects = await api<Project[]>("/api/projects");
      const p = projects.find((pr) => pr.slug === projectSlug);
      if (p) setProject(p);
    });
  }, [params]);

  if (!project) return <p className="text-[var(--muted)]">Loading...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-[var(--muted)]">
          {project.githubOwner
            ? `${project.githubOwner}/${project.githubRepo}`
            : "GitHub not connected"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {project.environments.map((env) => (
          <Link key={env.id} href={`/projects/${project.slug}/${env.type.toLowerCase()}`}>
            <Card className="cursor-pointer hover:border-[var(--accent)] transition-colors">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold capitalize">{env.type.toLowerCase()}</h3>
                <Badge
                  variant={
                    env.status === "LIVE"
                      ? "success"
                      : env.status === "FAILED"
                        ? "error"
                        : "default"
                  }
                >
                  {env.status.replace("_", " ").toLowerCase()}
                </Badge>
              </div>
              {env.lastDeployedAt && (
                <p className="text-xs text-[var(--muted)]">
                  Last deployed: {new Date(env.lastDeployedAt).toLocaleString()}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
