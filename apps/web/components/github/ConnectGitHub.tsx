"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl } from "@/lib/api";

interface Repo {
  fullName: string;
  name: string;
  owner: string;
  defaultBranch: string;
}

export function ConnectGitHub({
  projectId,
  installationId,
  environmentId,
  onRepoConnected,
}: {
  projectId: string;
  installationId: string | null;
  environmentId: string;
  onRepoConnected?: () => void;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [query, setQuery] = useState("");

  const filteredRepos = useMemo(() => {
    if (!query.trim()) return repos;
    const q = query.toLowerCase();
    return repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(q) ||
        repo.name.toLowerCase().includes(q) ||
        repo.owner.toLowerCase().includes(q),
    );
  }, [repos, query]);

  useEffect(() => {
    if (!installationId) return;
    setLoadingRepos(true);
    api<Repo[]>(`/api/projects/${projectId}/github/repos`)
      .then(setRepos)
      .finally(() => setLoadingRepos(false));
  }, [installationId, projectId]);

  const install = () => {
    const currentEnv = window.location.pathname.split("/")[3] ?? "staging";
    document.cookie = `heizen_pending_project=${projectId}; path=/; max-age=600; SameSite=Lax`;
    document.cookie = `heizen_pending_env=${currentEnv}; path=/; max-age=600; SameSite=Lax`;
    window.location.href = `${apiUrl("/api/github/install")}?projectId=${projectId}`;
  };

  const connect = async (repo: Repo) => {
    setConnecting(true);
    try {
      await api(`/api/projects/${projectId}/github/connect`, {
        method: "POST",
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: repo.defaultBranch,
          environmentId,
        }),
      });
      onRepoConnected?.();
    } finally {
      setConnecting(false);
    }
  };

  if (!installationId) {
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

  return (
    <div className="flex h-full min-h-[480px] items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h2 className="mb-1 text-base font-semibold">Select a repository</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Choose the repository to connect to this environment.
        </p>

        {loadingRepos && (
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        )}

        {!loadingRepos && repos.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-800 py-8 text-center">
            <p className="text-sm text-muted-foreground">No repositories accessible.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={install}>
              Manage app permissions
            </Button>
          </div>
        )}

        {!loadingRepos && repos.length > 0 && (
          <>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories..."
                className="pl-9"
              />
            </div>

            {filteredRepos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No repositories match &ldquo;{query}&rdquo;.
                </p>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.fullName}
                    type="button"
                    onClick={() => connect(repo)}
                    disabled={connecting}
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-left transition-colors hover:border-zinc-700 disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-medium">{repo.fullName}</p>
                      <p className="text-xs text-muted-foreground">{repo.defaultBranch}</p>
                    </div>
                    <GitHubIcon size={14} className="text-zinc-500" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
