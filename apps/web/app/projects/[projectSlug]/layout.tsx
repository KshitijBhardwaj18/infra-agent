"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const [projectSlug, setProjectSlug] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [githubBranch, setGithubBranch] = useState<string | null>(null);

  useEffect(() => {
    params.then(async ({ projectSlug: slug }) => {
      setProjectSlug(slug);
      const projects = await api<
        Array<{
          id: string;
          slug: string;
          name: string;
          githubBranch: string | null;
        }>
      >("/api/projects");
      const project = projects.find((p) => p.slug === slug);
      if (project) {
        setProjectId(project.id);
        setProjectName(project.name);
        setGithubBranch(project.githubBranch);
      }
    });
  }, [params]);

  return (
    <AppShell
      projectSlug={projectSlug}
      projectName={projectName}
      projectId={projectId}
      showAgent
      githubBranch={githubBranch}
    >
      {children}
    </AppShell>
  );
}
