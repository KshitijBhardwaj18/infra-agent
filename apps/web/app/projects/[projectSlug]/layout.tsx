"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { AgentPanel } from "@/components/layout/AgentPanel";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const [projectSlug, setProjectSlug] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    params.then(async ({ projectSlug: slug }) => {
      setProjectSlug(slug);
      const projects = await api<Array<{ id: string; slug: string }>>("/api/projects");
      const project = projects.find((p) => p.slug === slug);
      if (project) setProjectId(project.id);
    });
  }, [params]);

  return (
    <div className="flex h-screen">
      <Sidebar projectSlug={projectSlug} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
      {projectId && <AgentPanel projectId={projectId} />}
    </div>
  );
}
