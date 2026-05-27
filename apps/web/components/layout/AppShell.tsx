"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AgentPanel } from "./AgentPanel";

interface AppShellProps {
  children: React.ReactNode;
  projectSlug?: string;
  projectName?: string;
  projectId?: string;
  showAgent?: boolean;
  githubBranch?: string | null;
}

export function AppShell({
  children,
  projectSlug,
  projectName,
  projectId,
  showAgent = false,
  githubBranch,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden h-screen">
      <Sidebar projectSlug={projectSlug} projectName={projectName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          projectSlug={projectSlug}
          projectName={projectName}
          githubBranch={githubBranch}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
      {showAgent && projectId ? <AgentPanel projectId={projectId} /> : null}
    </div>
  );
}
