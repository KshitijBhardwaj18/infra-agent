"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl, ApiError } from "@/lib/api";
import { useGithubDisconnected } from "@/hooks/useWebSocket";

interface Repo {
  fullName: string;
  name: string;
  owner: string;
  defaultBranch: string;
}

export function ConnectGitHub({
  projectId,
  installationId: initialInstallationId,
  environmentId,
  currentEnv,
  onRepoConnected,
  onInstallationCleared,
}: {
  projectId: string;
  installationId: string | null;
  environmentId: string;
  /** The current environment slug, e.g. "staging" or "production". */
  currentEnv: "staging" | "production";
  onRepoConnected?: () => void;
  /** Called when the server reports the installation was revoked. */
  onInstallationCleared?: () => void;
}) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Track whether the installation is still considered valid locally
  const [installationId, setInstallationId] = useState(initialInstallationId);

  // When the server emits a github:disconnected event for this project,
  // clear local state so the UI re-prompts installation.
  useGithubDisconnected((payload) => {
    if (payload.projectIds.includes(projectId)) {
      setInstallationId(null);
      setRepos([]);
      onInstallationCleared?.();
    }
  });

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
    setInstallationId(initialInstallationId);
  }, [initialInstallationId]);

  useEffect(() => {
    if (!installationId) return;
    setLoadingRepos(true);
    setRepoError(null);
    api<Repo[]>(`/api/projects/${projectId}/github/repos`)
      .then(setRepos)
      .catch((err) => {
        // 409 = installation revoked — server already cleared it
        if (err instanceof ApiError && err.status === 409) {
          setInstallationId(null);
          onInstallationCleared?.();
        } else {
          setRepoError(
            err instanceof Error ? err.message : "Failed to load repositories",
          );
        }
      })
      .finally(() => setLoadingRepos(false));
  }, [installationId, projectId, onInstallationCleared]);

  /** Redirect to GitHub to install (or manage) the app. */
  const install = () => {
    // No cookies — state is carried as a signed server-side token in the
    // install URL and verified when GitHub redirects back to /api/github/callback.
    window.location.href = `${apiUrl("/api/github/install")}?projectId=${projectId}&return_env=${currentEnv}`;
  };

  /** Open the existing installation settings page to manage permissions. */
  const managePermissions = async () => {
    try {
      const { url } = await api<{ url: string }>(
        `/api/projects/${projectId}/github/manage-url`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Fall back to triggering a fresh install
      install();
    }
  };

  const connect = async (repo: Repo) => {
    setConnecting(true);
    setConnectError(null);
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
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect repository",
      );
    } finally {
      setConnecting(false);
    }
  };

  if (!installationId) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
            <GitHubIcon size={28} className="text-foreground/90" />
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

        {repoError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
            {repoError}
          </div>
        )}

        {!loadingRepos && !repoError && repos.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <p className="text-sm text-muted-foreground">No repositories accessible.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={managePermissions}>
              Manage app permissions
            </Button>
          </div>
        )}

        {!loadingRepos && repos.length > 0 && (
          <>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories..."
                className="pl-9"
              />
            </div>

            {connectError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
                {connectError}
              </div>
            )}

            {filteredRepos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
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
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/20 disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-medium">{repo.fullName}</p>
                      <p className="text-xs text-muted-foreground">{repo.defaultBranch}</p>
                    </div>
                    <GitHubIcon size={14} className="text-muted-foreground" />
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
