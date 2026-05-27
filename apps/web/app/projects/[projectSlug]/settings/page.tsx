"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Copy, Check } from "lucide-react";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { api, apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Project {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  githubInstallationId: string | null;
  environments: Array<{
    id: string;
    type: string;
    awsAccountId: string | null;
    awsRoleArn: string | null;
    region: string | null;
  }>;
}

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [awsAccountId, setAwsAccountId] = useState("");
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedEnvId, setCopiedEnvId] = useState(false);

  const productionEnv = project?.environments.find((e) => e.type === "PRODUCTION");

  const copyEnvironmentId = async () => {
    if (!productionEnv) return;
    await navigator.clipboard.writeText(productionEnv.id);
    setCopiedEnvId(true);
    setTimeout(() => setCopiedEnvId(false), 2000);
  };

  useEffect(() => {
    params.then(async ({ projectSlug }) => {
      const projects = await api<Project[]>("/api/projects");
      const p = projects.find((pr) => pr.slug === projectSlug);
      if (p) {
        setProject(p);
        setName(p.name);
        setBranch(p.githubBranch ?? "main");
        const prod = p.environments.find((e) => e.type === "PRODUCTION");
        if (prod) {
          setAwsAccountId(prod.awsAccountId ?? "");
          setAwsRoleArn(prod.awsRoleArn ?? "");
          setRegion(prod.region ?? "us-east-1");
        }
      }
      setLoading(false);
    });
  }, [params]);

  const saveGeneral = async () => {
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setProject({ ...project, name });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const saveAws = async () => {
    if (!project) return;
    const prod = project.environments.find((e) => e.type === "PRODUCTION");
    if (!prod) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/api/projects/${project.id}/environments/${prod.id}`, {
        method: "PATCH",
        body: JSON.stringify({ awsAccountId, awsRoleArn, region }),
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save AWS config");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const verifyAws = async () => {
    if (!project) return;
    const prod = project.environments.find((e) => e.type === "PRODUCTION");
    if (!prod) return;
    setVerifyResult(null);
    setSaveError(null);
    try {
      await saveAws();
    } catch {
      return;
    }
    try {
      const res = await api<{ message: string }>(
        `/api/projects/${project.id}/environments/${prod.id}/aws/verify`,
        { method: "POST" },
      );
      setVerifyResult(res.message);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/projects");
  };

  const connectGithub = () => {
    if (!project) return;
    // No cookies — signed state is passed as a server-side token via the install URL.
    window.location.href = `${apiUrl("/api/github/install")}?projectId=${project.id}&return_env=staging`;
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!project) return null;

  const connected = Boolean(project.githubOwner && project.githubRepo);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-base font-semibold">Project settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage configuration for {project.name}
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="aws">AWS</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="project-name">Project name</Label>
                <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Project slug</Label>
                <Input value={project.slug} readOnly className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Slug cannot be changed</p>
              </div>
              <Button size="sm" onClick={saveGeneral} disabled={saving}>
                Save changes
              </Button>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="github" className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
            {connected ? (
              <div className="space-y-4">
                <p className="text-sm text-foreground/90">
                  Connected to{" "}
                  <span className="font-mono text-xs">
                    {project.githubOwner}/{project.githubRepo}
                  </span>
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="branch">Default branch</Label>
                  <Input
                    id="branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={connectGithub}>
                  <GitHubIcon size={14} className="mr-2" />
                  Reconnect repository
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">No repository connected</p>
                <Button size="sm" className="mt-4" onClick={connectGithub}>
                  <GitHubIcon size={14} className="mr-2" />
                  Connect repository
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="aws" className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
            <p className="mb-4 text-xs text-muted-foreground">
              Production environment AWS credentials
            </p>
            <div className="space-y-4">
              {productionEnv && (
                <div className="space-y-1.5">
                  <Label>Environment ID</Label>
                  <p className="text-xs text-muted-foreground">
                    Use this as the External ID in your IAM role trust policy.
                  </p>
                  <div className="flex gap-2">
                    <Input value={productionEnv.id} readOnly className="font-mono text-xs" />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={copyEnvironmentId}
                      className="shrink-0"
                      aria-label="Copy environment ID"
                    >
                      {copiedEnvId ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>AWS Account ID</Label>
                <Input value={awsAccountId} onChange={(e) => setAwsAccountId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>IAM Role ARN</Label>
                <Input value={awsRoleArn} onChange={(e) => setAwsRoleArn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={saveAws} disabled={saving}>
                  Save
                </Button>
                <Button size="sm" onClick={verifyAws}>
                  Verify connection
                </Button>
              </div>
              {verifyResult && <p className="text-sm text-success">{verifyResult}</p>}
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="danger">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
            <h3 className="text-sm font-medium text-destructive">Delete project</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete this project and all associated environments. This cannot be
              undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger className="mt-4 inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white">
                <Trash2 size={14} />
                Delete project
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the project and all deployment history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteProject}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
