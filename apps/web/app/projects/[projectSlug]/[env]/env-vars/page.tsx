"use client";

import { useEffect, useState } from "react";
import { EnvVarTable } from "@/components/env-vars/EnvVarTable";
import { api } from "@/lib/api";

export default function EnvVarsPage({
  params,
}: {
  params: Promise<{ projectSlug: string; env: string }>;
}) {
  const [projectId, setProjectId] = useState("");
  const [envId, setEnvId] = useState("");

  useEffect(() => {
    params.then(async ({ projectSlug, env }) => {
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
    });
  }, [params]);

  if (!projectId || !envId) {
    return <p className="text-[var(--muted)]">Loading...</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Environment Variables</h1>
      <EnvVarTable projectId={projectId} envId={envId} />
    </div>
  );
}
