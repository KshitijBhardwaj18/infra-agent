"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DeploymentLogs } from "@/components/deploy/DeploymentLogs";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { useDeploymentStatus } from "@/hooks/useWebSocket";

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
    });
  }, [params]);

  useDeploymentStatus((payload) => {
    if (payload.deploymentId === deployId) {
      setStatus(payload.status);
    }
  });

  if (!projectId || !envId) {
    return <p className="text-[var(--muted)]">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/projects/${projectSlug}/${envType}`}
          className="text-sm text-[var(--muted)] hover:text-white"
        >
          Back to {envType}
        </Link>
        <h1 className="text-xl font-bold">Deployment</h1>
        <Badge
          variant={
            status === "SUCCESS"
              ? "success"
              : status === "FAILED"
                ? "error"
                : "default"
          }
        >
          {status.toLowerCase()}
        </Badge>
      </div>

      <DeploymentLogs projectId={projectId} envId={envId} deployId={deployId} />
    </div>
  );
}
