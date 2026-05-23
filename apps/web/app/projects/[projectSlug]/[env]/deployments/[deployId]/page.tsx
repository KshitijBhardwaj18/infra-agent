"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DeploymentLogs } from "@/components/deploy/DeploymentLogs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useDeploymentStatus } from "@/hooks/useWebSocket";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "SUCCESS"
      ? "bg-green-500"
      : status === "FAILED"
        ? "bg-red-500"
        : "bg-blue-500 animate-pulse";

  return <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} />;
}

export default function DeploymentPage({
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
  const [loading, setLoading] = useState(true);

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
          const deployment = await api<{ status: string }>(
            `/api/projects/${project.id}/environments/${environment.id}/deployments/${id}`,
          );
          setStatus(deployment.status);
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

  if (loading || !projectId || !envId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/projects/${projectSlug}/${envType}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to {envType}
        </Link>
        <h1 className="text-lg font-semibold">Deployment</h1>
        <Badge variant="outline" className="gap-1.5 font-normal capitalize">
          <StatusDot status={status} />
          {status.toLowerCase()}
        </Badge>
      </div>

      <DeploymentLogs projectId={projectId} envId={envId} deployId={deployId} />
    </div>
  );
}
