"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePathname } from "next/navigation";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectSlug: string }>;
}) {
  const pathname = usePathname();
  const [projectSlug, setProjectSlug] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [githubBranch, setGithubBranch] = useState<string | null>(null);
  const [envType, setEnvType] = useState<string | undefined>();
  const [envLabel, setEnvLabel] = useState<string | undefined>();

  useEffect(() => {
    params.then(async ({ projectSlug: slug }) => {
      setProjectSlug(slug);

      const envMatch = pathname.match(/\/projects\/[^/]+\/(staging|production)/);
      if (envMatch) {
        setEnvType(envMatch[1]);
        setEnvLabel(envMatch[1] === "production" ? "Production" : "Staging");
      } else {
        setEnvType(undefined);
        setEnvLabel(undefined);
      }

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
  }, [params, pathname]);

  return (
    <AppShell
      projectSlug={projectSlug}
      projectName={projectName}
      projectId={projectId}
      envType={envType}
      envLabel={envLabel}
      showAgent
      githubBranch={githubBranch}
    >
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </AppShell>
  );
}
