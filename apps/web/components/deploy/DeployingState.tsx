"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";

interface Deployment {
  id: string;
  status: string;
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

  useEffect(() => {
    api<Deployment[]>(
      `/api/projects/${projectId}/environments/${environmentId}/deployments`,
    ).then((deployments) => {
      const active =
        deployments.find(
          (d) => !["SUCCESS", "FAILED", "CANCELLED"].includes(d.status),
        ) ?? deployments[0];
      if (active) {
        setDeployId(active.id);
        setDeployStatus(active.status);
      }
    });
  }, [projectId, environmentId]);

  return (
    <Card className="mx-auto max-w-lg text-center">
      <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[var(--accent)]" />
      <Badge className="mb-2">Deploying</Badge>
      <h2 className="mb-2 text-xl font-semibold capitalize">
        Deployment in progress
      </h2>
      <p className="mb-2 text-sm text-[var(--muted)]">
        Building Docker image and provisioning infrastructure on AWS.
      </p>
      {deployStatus !== "QUEUED" && (
        <p className="mb-6 text-xs uppercase tracking-wide text-[var(--muted)]">
          Status: {deployStatus.replace("_", " ").toLowerCase()}
        </p>
      )}
      {deployId ? (
        <Link
          href={`/projects/${projectSlug}/${envType}/deployments/${deployId}`}
        >
          <Button>View Live Logs</Button>
        </Link>
      ) : (
        <p className="text-sm text-[var(--muted)]">Loading deployment...</p>
      )}
    </Card>
  );
}
