"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, TestTube2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

function StatusDot({ status }: { status: string }) {
  const color =
    status === "LIVE"
      ? "bg-green-500"
      : status === "FAILED"
        ? "bg-red-500"
        : status === "DEPLOYING"
          ? "bg-blue-500 animate-pulse"
          : "bg-zinc-500";

  return <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} />;
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(async ({ projectSlug }) => {
      const projects = await api<Project[]>("/api/projects");
      const p = projects.find((pr) => pr.slug === projectSlug);
      if (p) setProject(p);
      setLoading(false);
    });
  }, [params]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {project.githubOwner
            ? `${project.githubOwner}/${project.githubRepo}`
            : "GitHub not connected"}
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Environments
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {project.environments.map((env) => {
            const Icon = env.type === "PRODUCTION" ? Rocket : TestTube2;
            return (
              <Link
                key={env.id}
                href={`/projects/${project.slug}/${env.type.toLowerCase()}`}
              >
                <Card className="cursor-pointer border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={15} className="text-zinc-400" />
                      <h3 className="text-sm font-medium capitalize">
                        {env.type.toLowerCase()}
                      </h3>
                    </div>
                    <Badge variant="outline" className="gap-1.5 font-normal">
                      <StatusDot status={env.status} />
                      {env.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </div>
                  {env.lastDeployedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last deployed: {new Date(env.lastDeployedAt).toLocaleString()}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
