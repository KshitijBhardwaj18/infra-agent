"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
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

export default function NewProjectPage() {
  const router = useRouter();
  const { me } = useMe();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repos, setRepos] = useState<OrgRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<OrgRepo | null>(null);
  const [repoQuery, setRepoQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  useEffect(() => {
    api<OrgRepo[]>("/api/github/repos")
      .then(setRepos)
      .catch(() => setRepos([]))
      .finally(() => setLoadingRepos(false));
  }, []);

  const filteredRepos = useMemo(() => {
    if (!repoQuery.trim()) return repos;
    const q = repoQuery.toLowerCase();
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q),
    );
  }, [repos, repoQuery]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const project = await api<{ slug: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug,
          ...(selectedRepo
            ? {
                githubInstallationId: selectedRepo.installationId,
                githubOwner: selectedRepo.owner,
                githubRepo: selectedRepo.name,
                githubBranch: selectedBranch || selectedRepo.default_branch,
              }
            : {}),
        }),
      });
      router.push(`/projects/${project.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to projects
      </Link>

      <div className="mb-6 mt-6">
        <h1 className="text-base font-semibold">Create a project</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Give your project a name to get started.
        </p>
      </div>

      <form onSubmit={submit} className="max-w-lg space-y-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, "")
                    .replace(/^-+|-+$/g, ""),
                );
              }}
              required
            />
            <p className="text-xs text-muted-foreground">
              heizen.app/{slug || "your-project-slug"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium">GitHub repository</p>
            <span className="text-xs text-muted-foreground">Optional — connect later</span>
          </div>

          {loadingRepos && (
            <div className="space-y-2">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          )}

          {!loadingRepos && repos.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-6 text-center">
              {me?.systemRole === "ADMIN" ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    No GitHub connections yet.
                  </p>
                  <Link href={`${ADMIN_URL}/github`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Add one in the admin panel
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No GitHub connections yet — ask your admin to add one in the admin panel.
                </p>
              )}
            </div>
          )}

          {!loadingRepos && repos.length > 0 && (
            <>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={repoQuery}
                  onChange={(e) => setRepoQuery(e.target.value)}
                  placeholder="Search repositories..."
                  className="pl-9"
                />
              </div>

              {filteredRepos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No repositories match &ldquo;{repoQuery}&rdquo;.
                  </p>
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {filteredRepos.map((repo) => (
                    <button
                      key={repo.full_name}
                      type="button"
                      onClick={() => {
                        const next =
                          selectedRepo?.full_name === repo.full_name ? null : repo;
                        setSelectedRepo(next);
                        // Reset branch when switching repo so BranchSelect re-picks
                        // a sensible default after the new branch list loads.
                        setSelectedBranch("");
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                        selectedRepo?.full_name === repo.full_name
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
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {selectedRepo && (
          <div className="rounded-lg border border-border bg-card p-5">
            <BranchSelect
              installationId={selectedRepo.installationId}
              owner={selectedRepo.owner}
              repo={selectedRepo.name}
              value={selectedBranch}
              onChange={setSelectedBranch}
              fallback={selectedRepo.default_branch}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Defaults to <code>{selectedRepo.default_branch}</code>.
            </p>
          </div>
        )}

        <Separator />

        <Button type="submit" disabled={loading || !name.trim() || !slug} className="w-full">
          {loading ? "Creating..." : "Create project"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </div>
  );
}
