"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Rocket,
  TestTube2,
  ChevronDown,
  ArrowRight,
  GitBranch,
  History,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, StatusDot } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  environments: Array<{
    id: string;
    type: string;
    status: string;
    lastDeployedAt: string | null;
    heizenConfig: unknown | null;
  }>;
}

interface DeploymentRow {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  envSlug: string;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(start?: string | null, end?: string | null) {
  if (!start) return "—";
  const endMs = end ? new Date(end).getTime() : Date.now();
  const secs = Math.floor((endMs - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(async ({ projectSlug }) => {
      const projects = await api<Project[]>("/api/projects");
      const p = projects.find((pr) => pr.slug === projectSlug);
      if (!p) {
        setLoading(false);
        return;
      }
      setProject(p);

      const all: DeploymentRow[] = [];
      for (const env of p.environments) {
        const list = await api<
          Array<{
            id: string;
            status: string;
            createdAt: string;
            startedAt: string | null;
            completedAt: string | null;
          }>
        >(`/api/projects/${p.id}/environments/${env.id}/deployments`);
        for (const d of list) {
          all.push({ ...d, envSlug: env.type.toLowerCase() });
        }
      }
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDeployments(all.slice(0, 5));
      setLoading(false);
    });
  }, [params]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const envAction = (env: Project["environments"][0]) => {
    if (env.status === "LIVE") return "Open";
    if (env.status === "DEPLOYING") return "View";
    if (env.heizenConfig) return "Configure";
    return "Set up";
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">{project.name}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <GitBranch size={12} />
            {project.githubOwner
              ? `${project.githubOwner}/${project.githubRepo} · ${project.githubBranch ?? "main"}`
              : "GitHub not connected"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Deploy
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => router.push(`/projects/${project.slug}/production`)}
            >
              Deploy to Production
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/projects/${project.slug}/staging`)}>
              Deploy to Staging
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Environments
        </span>
        <div className="flex-1 border-t border-border/50" />
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {project.environments.map((env) => {
          const Icon = env.type === "PRODUCTION" ? Rocket : TestTube2;
          const slug = env.type.toLowerCase();
          return (
            <div
              key={env.id}
              className="rounded-lg border border-border bg-card/50 p-4 transition-colors hover:border-foreground/20"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={15} className="text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">{slug}</span>
                </div>
                <StatusBadge status={env.status} />
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {env.lastDeployedAt
                  ? `Last deployed ${timeAgo(env.lastDeployedAt)}`
                  : "Never deployed"}
              </p>
              <div className="flex gap-2">
                <Link href={`/projects/${project.slug}/${slug}`}>
                  <Button size="sm" variant="outline">
                    {envAction(env)}
                  </Button>
                </Link>
                {env.heizenConfig != null && (
                  <Link href={`/projects/${project.slug}/${slug}`}>
                    <Button size="sm">Deploy</Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Recent deployments
        </span>
        <div className="flex-1 border-t border-border/50" />
      </div>

      {deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <History size={20} className="text-muted-foreground/70" />
          <p className="mt-3 text-sm text-muted-foreground">No deployments yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {deployments.map((d) => (
            <Link
              key={d.id}
              href={`/projects/${project.slug}/${d.envSlug}/deployments/${d.id}`}
              className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-card/50"
            >
              <StatusDot status={d.status} />
              <span className="text-sm capitalize text-foreground/90">{d.envSlug}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(d.createdAt)}</span>
              <span className="text-xs text-muted-foreground/70">
                {formatDuration(d.startedAt ?? d.createdAt, d.completedAt)}
              </span>
              <ArrowRight size={14} className="ml-auto text-muted-foreground/70" />
            </Link>
          ))}
          <Link
            href={`/projects/${project.slug}/deployments`}
            className="block px-4 py-3 text-xs text-muted-foreground hover:text-foreground"
          >
            View all deployments →
          </Link>
        </div>
      )}
    </div>
  );
}
