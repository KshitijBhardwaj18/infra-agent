"use client";

import Link from "next/link";
import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Environment {
  id: string;
  type: string;
  status: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  environments: Environment[];
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "LIVE"
      ? "bg-success"
      : status === "FAILED"
        ? "bg-destructive"
        : status === "DEPLOYING"
          ? "bg-info animate-pulse"
          : "bg-muted-foreground";

  return <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} />;
}

function EnvBadge({ env }: { env: Environment }) {
  const label = env.type.charAt(0) + env.type.slice(1).toLowerCase();
  const status = env.status.toLowerCase().replace("_", " ");

  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-foreground/90">
      <StatusDot status={env.status} />
      {label} · {status}
    </Badge>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const connected = Boolean(project.githubOwner && project.githubRepo);
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <Link href={`/projects/${project.slug}`}>
      <div className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-semibold text-white">
            {initial}
          </div>
          <Badge variant={connected ? "secondary" : "outline"} className="font-normal">
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>

        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{project.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch size={12} />
            {connected ? `${project.githubOwner}/${project.githubRepo}` : "No repository linked"}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {project.environments.map((env) => (
            <EnvBadge key={env.id} env={env} />
          ))}
        </div>
      </div>
    </Link>
  );
}
