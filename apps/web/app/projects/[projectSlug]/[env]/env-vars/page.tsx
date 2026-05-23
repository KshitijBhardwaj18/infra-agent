"use client";

import { useEffect, useState } from "react";
import { EnvVarTable } from "@/components/env-vars/EnvVarTable";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export default function EnvVarsPage({
  params,
}: {
  params: Promise<{ projectSlug: string; env: string }>;
}) {
  const [projectId, setProjectId] = useState("");
  const [envId, setEnvId] = useState("");
  const [envType, setEnvType] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(async ({ projectSlug, env }) => {
      setEnvType(env);
      const projects = await api<
        Array<{ id: string; slug: string; environments: Array<{ id: string; type: string }> }>
      >("/api/projects");
      const project = projects.find((p) => p.slug === projectSlug);
      if (project) {
        setProjectId(project.id);
        const environment = project.environments.find(
          (e) => e.type.toLowerCase() === env.toLowerCase(),
        );
        if (environment) setEnvId(environment.id);
      }
      setLoading(false);
    });
  }, [params]);

  if (loading || !projectId || !envId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold capitalize">Environment variables</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage secrets for {envType}
      </p>
      <div className="mt-6">
        <EnvVarTable projectId={projectId} envId={envId} />
      </div>
    </div>
  );
}
