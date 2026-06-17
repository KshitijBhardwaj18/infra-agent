"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Link from "next/link";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiUrl } from "@/lib/api";
import { useGithubDisconnected } from "@/hooks/useWebSocket";
import { useMe } from "@/hooks/useMe";
import { buttonVariants } from "@/components/ui/button";
import { BranchSelect } from "@/components/github/BranchSelect";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3002";

interface OrgRepo {
  connectionId: string;
  installationId: string;
  accountLogin: string;
  full_name: string;
  name: string;
  owner: string;
  default_branch: string;
  private: boolean;
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
  const { me } = useMe();
  const [repos, setRepos] = useState<OrgRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [installationId, setInstallationId] = useState(initialInstallationId);
  const [pickedRepo, setPickedRepo] = useState<OrgRepo | null>(null);
  const [pickedBranch, setPickedBranch] = useState<string>("");

  useGithubDisconnected((payload) => {
    if (payload.projectIds.includes(projectId)) {
      setInstallationId(null);
      setRepos([]);
      onInstallationCleared?.();
      fetchRepos();
    }
  });

  function fetchRepos() {
    setLoadingRepos(true);
    setRepoError(null);
    api<OrgRepo[]>("/api/github/repos")
      .then(setRepos)
      .catch((err) => {
        setRepoError(
          err instanceof Error ? err.message : "Failed to load repositories",
        );
      })
      .finally(() => setLoadingRepos(false));
  }

  useEffect(() => {
    fetchRepos();
  }, []);

  useEffect(() => {
    setInstallationId(initialInstallationId);
  }, [initialInstallationId]);

  const filteredRepos = useMemo(() => {
    if (!query.trim()) return repos;
    const q = query.toLowerCase();
    return repos.filter(
      (repo) =>
        repo.full_name.toLowerCase().includes(q) ||
        repo.name.toLowerCase().includes(q) ||
        repo.owner.toLowerCase().includes(q),
    );
  }, [repos, query]);

  /** Redirect to GitHub to install (or manage) the app. */
  const install = () => {
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
      install();
    }
  };

  const connect = async (repo: OrgRepo, branch: string) => {
    setConnecting(true);
    setConnectError(null);
    try {
      await api(`/api/projects/${projectId}/github/connect`, {
        method: "POST",
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: branch || repo.default_branch,
          environmentId,
          installationId: repo.installationId,
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
            {me?.systemRole === "ADMIN" ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  No GitHub connections yet.
                </p>
                <Link href={`${ADMIN_URL}/github`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Add a connection in admin panel
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No GitHub connections yet. Ask your workspace admin to add one.
              </p>
            )}
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

            {filteredRepos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No repositories match &ldquo;{query}&rdquo;.
                </p>
              </div>
            ) : (
              <>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {filteredRepos.map((repo) => {
                    const isPicked = pickedRepo?.full_name === repo.full_name;
                    return (
                      <button
                        key={repo.full_name}
                        type="button"
                        onClick={() => {
                          setPickedRepo(isPicked ? null : repo);
                          setPickedBranch("");
                        }}
                        disabled={connecting}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                          isPicked
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-foreground/20"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{repo.full_name}</p>
                            {repo.private && (
                              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                private
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{repo.default_branch}</p>
                        </div>
                        <GitHubIcon size={14} className="text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
                {pickedRepo && (
                  <div className="mt-3 rounded-lg border border-border bg-card p-4 space-y-3">
                    <BranchSelect
                      installationId={pickedRepo.installationId}
                      owner={pickedRepo.owner}
                      repo={pickedRepo.name}
                      value={pickedBranch}
                      onChange={setPickedBranch}
                      fallback={pickedRepo.default_branch}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => connect(pickedRepo, pickedBranch)}
                      disabled={connecting}
                      className="w-full"
                    >
                      {connecting ? "Connecting…" : `Connect ${pickedRepo.full_name}`}
                    </Button>
                    {connectError && (
                      <p className="text-xs text-destructive">{connectError}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {me?.systemRole === "ADMIN" && (
              <div className="mt-4 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={managePermissions}>
                  Manage app permissions
                </Button>
                <Link href={`${ADMIN_URL}/github`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Add a new connection
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
