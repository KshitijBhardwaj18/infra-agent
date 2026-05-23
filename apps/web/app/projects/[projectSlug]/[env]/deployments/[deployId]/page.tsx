"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Circle, Loader2, X } from "lucide-react";
import { DeploymentLogs } from "@/components/deploy/DeploymentLogs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useDeploymentStatus } from "@/hooks/useWebSocket";
import { useSse } from "@/hooks/useSse";
import type { DeploymentLogPayload } from "@heizen/shared";

const STEPS = [
  { key: "build", label: "Build", phases: ["DOCKER_BUILD"] },
  { key: "push", label: "Push", phases: ["DOCKER_PUSH"] },
  { key: "deploy", label: "Deploy", phases: ["PULUMI", "SYSTEM"] },
] as const;

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function DeploymentDetailContent({
  params,
}: {
  params: Promise<{ projectSlug: string; env: string; deployId: string }>;
}) {
  const [projectId, setProjectId] = useState("");
  const [envId, setEnvId] = useState("");
  const [deployId, setDeployId] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [envType, setEnvType] = useState("");
  const [status, setStatus] = useState("QUEUED");
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);

  const logUrl =
    projectId && envId && deployId
      ? `/api/projects/${projectId}/environments/${envId}/deployments/${deployId}/logs/stream`
      : null;
  const { data: logs } = useSse<DeploymentLogPayload>(logUrl, Boolean(logUrl));

  useEffect(() => {
    params.then(async ({ projectSlug: slug, env, deployId: id }) => {
      setProjectSlug(slug);
      setEnvType(env);
      setDeployId(id);

      const projects = await api<
        Array<{ id: string; slug: string; environments: Array<{ id: string; type: string }> }>
      >("/api/projects");
      const project = projects.find((p) => p.slug === slug);
      if (project) {
        setProjectId(project.id);
        const environment = project.environments.find(
          (e) => e.type.toLowerCase() === env.toLowerCase(),
        );
        if (environment) {
          setEnvId(environment.id);
          const deployment = await api<{ status: string; createdAt: string }>(
            `/api/projects/${project.id}/environments/${environment.id}/deployments/${id}`,
          );
          setStatus(deployment.status);
          setCreatedAt(deployment.createdAt);
        }
      }
      setLoading(false);
    });
  }, [params]);

  useDeploymentStatus((payload) => {
    if (payload.deploymentId === deployId) {
      setStatus(payload.status);
    }
  });

  const stepStates = useMemo(() => {
    const latestPhase = logs[logs.length - 1]?.phase;
    const finished = ["SUCCESS", "CANCELLED"].includes(status);
    const failed = status === "FAILED";

    return STEPS.map((step, index) => {
      const hasLogs = logs.some((l) => (step.phases as readonly string[]).includes(l.phase));
      const isActive =
        !finished &&
        !failed &&
        (step.phases as readonly string[]).includes(latestPhase ?? "DOCKER_BUILD");
      const isDone =
        finished ||
        STEPS.slice(index + 1).some((s) =>
          logs.some((l) => (s.phases as readonly string[]).includes(l.phase)),
        ) ||
        (hasLogs && !isActive && !failed);

      if (failed && isActive) return "failed" as const;
      if (isDone) return "done" as const;
      if (isActive) return "active" as const;
      return "waiting" as const;
    });
  }, [logs, status]);

  if (loading || !projectId || !envId) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href={`/projects/${projectSlug}/${envType}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-base font-semibold">Deployment {deployId.slice(0, 8)}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {envType} · {createdAt ? timeAgo(createdAt) : "—"}
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between gap-4">
          {STEPS.map((step, i) => {
            const state = stepStates[i];
            return (
              <div key={step.key} className="flex flex-1 items-center gap-2">
                <div className="flex flex-col items-center gap-2">
                  {state === "done" ? (
                    <Check size={16} className="text-green-500" />
                  ) : state === "active" ? (
                    <Loader2 size={16} className="animate-spin text-blue-500" />
                  ) : state === "failed" ? (
                    <X size={16} className="text-red-500" />
                  ) : (
                    <Circle size={16} className="text-zinc-700" />
                  )}
                  <span
                    className={cn(
                      "text-xs uppercase",
                      state === "active" ? "text-white" : "text-zinc-500",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mb-5 h-px flex-1 bg-zinc-800 last:hidden" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <DeploymentLogs projectId={projectId} envId={envId} deployId={deployId} />
    </div>
  );
}

export default function DeploymentPage({
  params,
}: {
  params: Promise<{ projectSlug: string; env: string; deployId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-4 p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      }
    >
      <DeploymentDetailContent params={params} />
    </Suspense>
  );
}
