"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/useProject";
import Link from "next/link";
import { ArrowLeft, Check, Circle, Loader2, X } from "lucide-react";
import { DeploymentLogs } from "@/components/deploy/DeploymentLogs";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useDeploymentStatus } from "@/hooks/useWebSocket";
import { useSse } from "@/hooks/useSse";
import type { DeploymentLogPayload } from "@heizen/shared";

// Step labels switch on deployment.kind. The middle step's "active"
// happens during DEPLOYING regardless of kind (the deployment status
// enum is shared) — we only rename what the user reads.
function buildSteps(kind: "DEPLOY" | "DESTROY") {
  return [
    {
      key: "setup",
      label: "Setup",
      activeStatuses: ["QUEUED"],
      doneAfter: ["DEPLOYING", "SUCCESS"],
    },
    {
      key: "run",
      label: kind === "DESTROY" ? "Destroy" : "Deploy",
      activeStatuses: ["DEPLOYING"],
      doneAfter: ["SUCCESS"],
    },
  ] as const;
}

type StepState = "waiting" | "active" | "done" | "failed";

function DeploymentDetailContent({
  params,
}: {
  params: Promise<{ projectSlug: string; env: string; deployId: string }>;
}) {
  const { projectSlug, env: envType, deployId } = use(params);
  const { project, loading: projectLoading } = useProject(projectSlug);
  const projectId = project?.id ?? "";
  const environment = project?.environments.find(
    (e) => e.type.toLowerCase() === envType.toLowerCase(),
  );
  const envId = environment?.id ?? "";

  const deploymentQuery = useQuery({
    queryKey: ["deployment", projectId, envId, deployId] as const,
    queryFn: () =>
      api<{
        status: string;
        kind?: "DEPLOY" | "DESTROY";
        createdAt: string;
      }>(`/api/projects/${projectId}/environments/${envId}/deployments/${deployId}`),
    enabled: !!projectId && !!envId && !!deployId,
    staleTime: 30_000,
  });
  const loading = projectLoading || deploymentQuery.isLoading;

  // Local mirror of status so WebSocket updates can override the
  // cached value without invalidating the whole query.
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const status = statusOverride ?? deploymentQuery.data?.status ?? "QUEUED";
  const kind = deploymentQuery.data?.kind ?? "DEPLOY";
  const createdAt = deploymentQuery.data?.createdAt ?? "";

  const logUrl =
    projectId && envId && deployId
      ? `/api/projects/${projectId}/environments/${envId}/deployments/${deployId}/logs/stream`
      : null;
  const { data: logs } = useSse<DeploymentLogPayload>(logUrl, Boolean(logUrl));

  useDeploymentStatus((payload) => {
    if (payload.deploymentId === deployId) {
      setStatusOverride(payload.status);
    }
  });

  const steps = useMemo(() => buildSteps(kind), [kind]);

  const stepStates = useMemo<StepState[]>(() => {
    const failed = status === "FAILED";
    const cancelled = status === "CANCELLED";

    return steps.map((step) => {
      if (cancelled) return "done";

      const isActive = (
        step.activeStatuses as readonly string[]
      ).includes(status);
      const isDone = (step.doneAfter as readonly string[]).includes(status);

      if (isDone) return "done";

      if (failed) {
        if (step.key === "setup") {
          const hasPulumiLogs = logs.some((l) => l.phase === "PULUMI");
          return hasPulumiLogs ? "done" : "failed";
        }
        if (step.key === "run") {
          const hasLogPhases = logs.some((l) => l.phase === "PULUMI");
          return hasLogPhases ? "failed" : "waiting";
        }
        return "waiting";
      }

      if (isActive) return "active";
      return "waiting";
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
          <h1 className="text-base font-semibold">
            {kind === "DESTROY" ? "Destroy" : "Deployment"} ·{" "}
            <span className="font-mono text-muted-foreground">
              {deployId.slice(0, 8)}
            </span>
          </h1>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {envType} · {createdAt ? timeAgo(createdAt) : "—"}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/50 p-5">
        <div className="flex items-center gap-2">
          {steps.map((step, i) => {
            const state = stepStates[i];
            return (
              <div key={step.key} className="flex flex-1 items-center gap-2">
                <div className="flex flex-col items-center gap-2">
                  {state === "done" ? (
                    <Check size={16} className="text-success" />
                  ) : state === "active" ? (
                    <Loader2
                      size={16}
                      className="animate-spin text-info"
                    />
                  ) : state === "failed" ? (
                    <X size={16} className="text-destructive" />
                  ) : (
                    <Circle size={16} className="text-foreground/20" />
                  )}
                  <span
                    className={cn(
                      "text-xs uppercase tracking-wide",
                      state === "active"
                        ? "text-foreground"
                        : state === "done"
                          ? "text-muted-foreground"
                          : state === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground/70",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="mb-5 h-px flex-1 bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <DeploymentLogs
        projectId={projectId}
        envId={envId}
        deployId={deployId}
      />
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
