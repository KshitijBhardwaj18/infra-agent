"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useDeploymentStatus } from "@/hooks/useWebSocket";

interface Deployment {
  id: string;
  status: string;
  createdAt?: string;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function DeployingState({
  projectId,
  projectSlug,
  envType,
  environmentId,
}: {
  projectId: string;
  projectSlug: string;
  envType: string;
  environmentId: string;
}) {
  const [deployId, setDeployId] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<string>("QUEUED");
  const [deployCreatedAt, setDeployCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Deployment[]>(
      `/api/projects/${projectId}/environments/${environmentId}/deployments`,
    )
      .then((deployments) => {
        const active =
          deployments.find(
            (d) => !["SUCCESS", "FAILED", "CANCELLED"].includes(d.status),
          ) ?? deployments[0];
        if (active) {
          setDeployId(active.id);
          setDeployStatus(active.status);
          if (active.createdAt) setDeployCreatedAt(active.createdAt);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId, environmentId]);

  useDeploymentStatus((payload) => {
    if (payload.deploymentId === deployId) {
      setDeployStatus(payload.status);
    }
  });

  const phaseLabel =
    deployStatus === "QUEUED"
      ? "Waiting to start..."
      : deployStatus === "DEPLOYING"
        ? "Deploying infrastructure"
        : "Preparing";

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-border bg-card p-5">
      <div className="flex justify-center">
        <Loader2 size={24} className="animate-spin text-info" />
      </div>
      <h2 className="mt-4 text-base font-medium capitalize">
        Deploying to {envType}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{phaseLabel}</p>

      <Separator className="my-4" />

      {loading ? (
        <Skeleton className="h-5 w-40" />
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="font-normal">
            {deployStatus.replace("_", " ").toLowerCase()}
          </Badge>
          <span className="text-muted-foreground">
            · Started {deployCreatedAt ? timeAgo(deployCreatedAt) : "just now"}
          </span>
        </div>
      )}

      {deployId ? (
        <Link
          href={`/projects/${projectSlug}/${envType}/deployments/${deployId}`}
        >
          <Button size="sm" className="mt-4 w-full">
            View live logs
            <ArrowRight size={14} className="ml-2" />
          </Button>
        </Link>
      ) : (
        !loading && (
          <p className="mt-4 text-sm text-muted-foreground">
            No active deployment found.
          </p>
        )
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Infrastructure provisioning takes 15–20 minutes on first deploy.
      </p>
    </div>
  );
}
