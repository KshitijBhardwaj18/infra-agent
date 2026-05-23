"use client";

import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

export function ConnectGitHub({ projectId }: { projectId: string }) {
  const install = () => {
    window.location.href = `${apiUrl("/api/github/install")}?projectId=${projectId}`;
  };

  return (
    <div className="flex h-full min-h-[480px] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <GitHubIcon size={28} className="text-zinc-300" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">Connect your repository</h2>
        <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Install the Heizen GitHub App to connect your repository. We&apos;ll analyse
          your codebase and configure infrastructure automatically.
        </p>
        <Button onClick={install} className="mx-auto w-full max-w-xs">
          <GitHubIcon size={15} className="mr-2" />
          Connect Repository
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          You control which repositories Heizen can access
        </p>
      </div>
    </div>
  );
}
