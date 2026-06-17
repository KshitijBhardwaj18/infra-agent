"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useDeploymentStatus } from "@/hooks/useWebSocket";

interface Deployment {
  id: string;
  status: string;
  /** "DEPLOY" or "DESTROY". Older rows without the field default to
   *  DEPLOY at the api/Prisma layer. */
  kind?: string;
  createdAt?: string;
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
  const [deployKind, setDeployKind] = useState<string>("DEPLOY");
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
          setDeployKind(active.kind ?? "DEPLOY");
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

  const isDestroy = deployKind === "DESTROY";
  const verbing = isDestroy ? "Destroying" : "Deploying";
  const phaseLabel =
    deployStatus === "QUEUED"
      ? "Waiting to start..."
      : deployStatus === "DEPLOYING"
        ? (isDestroy ? "Tearing down infrastructure" : "Deploying infrastructure")
        : "Preparing";

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-border bg-card p-5">
      <div className="flex justify-center">
        <Loader2 size={24} className="animate-spin text-info" />
      </div>
      <h2 className="mt-4 text-base font-medium capitalize">
        {verbing} {envType}
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
            No active {isDestroy ? "destroy" : "deployment"} found.
          </p>
        )
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        {isDestroy
          ? "Tearing down infrastructure takes 5–10 minutes. RDS deletion is the slow step."
          : "Infrastructure provisioning takes 15–20 minutes on first deploy."}
      </p>
    </div>
  );
}
