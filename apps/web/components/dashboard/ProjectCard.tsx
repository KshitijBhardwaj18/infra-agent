"use client";

import Link from "next/link";
import { GitBranch, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
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

export function ProjectCard({ project }: { project: Project }) {
  const connected = Boolean(project.githubOwner && project.githubRepo);
  const initial = project.name.charAt(0).toUpperCase();
  const repoPath = connected
    ? `${project.githubOwner}/${project.githubRepo}`
    : "No repository linked";

  return (
    <Link href={`/projects/${project.slug}`} className="group block">
      <div
        className={cn(
          "h-full rounded-xl border border-border bg-card p-5",
          "transition-[border-color,transform,box-shadow] duration-200",
          "group-hover:-translate-y-0.5 group-hover:border-foreground/30 group-hover:shadow-sm",
        )}
      >
        {/* Top row: logo + status pill */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-sm font-semibold text-white shadow-sm">
            {initial}
          </div>
          <Badge
            variant={connected ? "secondary" : "outline"}
            className="font-medium"
          >
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>

        {/* Title + repo path */}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-base font-semibold text-foreground">
              {project.name}
            </p>
            <ArrowRight
              size={14}
              className="shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </div>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <GitBranch size={11} className="shrink-0" />
            <span className="truncate">{repoPath}</span>
          </p>
        </div>

        {/* Env status row */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          {project.environments.map((env) => (
            <StatusBadge
              key={env.id}
              status={env.status}
              label={
                env.type.charAt(0) + env.type.slice(1).toLowerCase()
              }
            />
          ))}
        </div>
      </div>
    </Link>
  );
}
