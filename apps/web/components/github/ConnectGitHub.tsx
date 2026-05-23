"use client";

import { Github } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { apiUrl } from "@/lib/api";

export function ConnectGitHub({ projectId }: { projectId: string }) {
  const install = () => {
    window.location.href = `${apiUrl("/api/github/install")}?projectId=${projectId}`;
  };

  return (
    <Card className="max-w-lg mx-auto text-center">
      <Github className="mx-auto mb-4 h-12 w-12 text-[var(--muted)]" />
      <h2 className="mb-2 text-xl font-semibold">Connect Repository</h2>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Install the Heizen GitHub App to connect your repository and start analyzing your codebase.
      </p>
      <Button onClick={install}>Connect Repository</Button>
    </Card>
  );
}
