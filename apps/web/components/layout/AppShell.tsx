"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AgentPanel } from "./AgentPanel";

interface AppShellProps {
  children: React.ReactNode;
  projectSlug?: string;
  projectName?: string;
  projectId?: string;
  envType?: string;
  envLabel?: string;
  showAgent?: boolean;
  githubBranch?: string | null;
}

export function AppShell({
  children,
  projectSlug,
  projectName,
  projectId,
  envType,
  envLabel,
  showAgent = false,
  githubBranch,
}: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar projectSlug={projectSlug} envType={envType} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          projectSlug={projectSlug}
          projectName={projectName}
          envLabel={envLabel}
          githubBranch={githubBranch}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      {showAgent && projectId ? <AgentPanel projectId={projectId} /> : null}
    </div>
  );
}
