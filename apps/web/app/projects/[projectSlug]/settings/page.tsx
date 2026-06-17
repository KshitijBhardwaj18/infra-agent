"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/hooks/useProject";
import Link from "next/link";
import { Trash2, Copy, Check, ExternalLink, AlertTriangle } from "lucide-react";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { BranchSelect } from "@/components/github/BranchSelect";
import { ObservabilitySources } from "@/components/observability/ObservabilitySources";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { AWS_REGIONS } from "@heizen/shared";
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

interface AwsSetupInfo {
  heizenAccountId: string;
  externalId: string;
  region: string;
  templateUrl: string;
  launchUrl: string;
  localhostTemplate: boolean;
}

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const router = useRouter();
  const { projectSlug } = use(params);
  const { project, loading, invalidate: invalidateProjects } = useProject(projectSlug);

  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedEnvId, setCopiedEnvId] = useState(false);
  const [awsSetup, setAwsSetup] = useState<AwsSetupInfo | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const productionEnv = project?.environments.find((e) => e.type === "PRODUCTION");

  // Account ID is derived from the role ARN (backend stores the same value).
  const derivedAccountId =
    /^arn:aws:iam::(\d{12}):role\//.exec(awsRoleArn.trim())?.[1] ?? null;
  // A non-empty ARN that doesn't parse means it's mistyped.
  const arnInvalid = awsRoleArn.trim().length > 0 && !derivedAccountId;

  const copyEnvironmentId = async () => {
    if (!productionEnv) return;
    await navigator.clipboard.writeText(productionEnv.id);
    setCopiedEnvId(true);
    setTimeout(() => setCopiedEnvId(false), 2000);
  };

  // Seed form fields from the cached project when it arrives. Effect
  // re-runs if the user navigates between projects without unmounting
  // (rare on this page but keeps the contract clean).
  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setBranch(project.githubBranch ?? "main");
    const prod = project.environments.find((e) => e.type === "PRODUCTION");
    if (prod) {
      setAwsRoleArn(prod.awsRoleArn ?? "");
      setRegion(prod.region ?? "us-east-1");
    }
  }, [project]);

  const saveGeneral = async () => {
    if (!project) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, githubBranch: branch }),
      });
      // Invalidate the shared projects cache so dashboard / list /
      // detail / env pages pick up the rename + branch change.
      invalidateProjects();
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
        body: JSON.stringify({ awsRoleArn, region }),
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

  // One-click setup: ask the API for the platform account id + a pre-built
  // CloudFormation quick-create URL, then open the AWS console. We only open
  // the console when the template URL is publicly reachable — on localhost
  // the AWS console can't fetch it, so we surface the fetched info + a hint
  // instead of opening a link that would fail.
  const launchCloudFormation = async () => {
    if (!project || !productionEnv) return;
    setSetupLoading(true);
    setSetupError(null);
    try {
      const info = await api<AwsSetupInfo>(
        `/api/projects/${project.id}/environments/${productionEnv.id}/aws-setup/info`,
      );
      setAwsSetup(info);
      if (!info.localhostTemplate) {
        window.open(info.launchUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setSetupError(
        err instanceof Error ? err.message : "Couldn't prepare CloudFormation setup",
      );
    } finally {
      setSetupLoading(false);
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/projects");
  };

  const connectGithub = () => {
    if (!project) return;
    // Repo selection lives on the env page, which renders the org-wide picker.
    // Members can use it without any admin-only install dance.
    router.push(`/projects/${project.slug}/staging`);
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
        <PageHeader
          title="Settings"
          subtitle="Project configuration"
        />
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="aws">AWS</TabsTrigger>
          <TabsTrigger value="observability">Observability</TabsTrigger>
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
                <BranchSelect
                  installationId={project.githubInstallationId}
                  owner={project.githubOwner}
                  repo={project.githubRepo}
                  value={branch}
                  onChange={setBranch}
                  fallback={branch || "main"}
                  label="Default branch"
                />
                <Button size="sm" variant="outline" onClick={saveGeneral} disabled={saving}>
                  Save branch
                </Button>
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
          {productionEnv && (
            <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
              <h3 className="text-sm font-medium">One-click role setup</h3>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">
                Create the IAM deploy role in your AWS account with CloudFormation,
                then paste the generated Role ARN below and verify. No manual IAM
                policy editing.
              </p>
              <Button size="sm" onClick={launchCloudFormation} disabled={setupLoading}>
                <ExternalLink size={14} className="mr-2" />
                {setupLoading ? "Preparing…" : "Launch AWS CloudFormation"}
              </Button>

              {awsSetup && (
                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Heizen account ID</dt>
                    <dd className="font-mono">{awsSetup.heizenAccountId}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">External ID</dt>
                    <dd className="font-mono">{awsSetup.externalId}</dd>
                  </div>
                </dl>
              )}

              {awsSetup?.localhostTemplate && (
                <div className="mt-3 flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Your API is on localhost, which the AWS console can&apos;t reach to
                    load the template. Deploy the API to a public URL (set{" "}
                    <span className="font-mono">API_PUBLIC_URL</span>) before using
                    one-click setup, or create the role manually below.
                  </p>
                </div>
              )}

              {setupError && (
                <p className="mt-3 text-sm text-destructive">{setupError}</p>
              )}
            </div>
          )}

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
                <Label>IAM Role ARN</Label>
                <Input
                  value={awsRoleArn}
                  onChange={(e) => setAwsRoleArn(e.target.value)}
                  placeholder="arn:aws:iam::123456789012:role/heizen-deploy"
                  className="font-mono text-xs"
                />
                <p
                  className={`text-xs ${
                    arnInvalid ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {derivedAccountId ? (
                    <>
                      AWS account{" "}
                      <code className="font-mono text-foreground">
                        {derivedAccountId}
                      </code>{" "}
                      — detected from the role ARN.
                    </>
                  ) : arnInvalid ? (
                    "That doesn't look like a role ARN — expected arn:aws:iam::<account>:role/<name>."
                  ) : (
                    "The account ID is read automatically from this ARN."
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <NativeSelect
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} — {r.label}
                    </option>
                  ))}
                  {region && !AWS_REGIONS.some((r) => r.code === region) && (
                    <option value={region}>{region} (unsupported)</option>
                  )}
                </NativeSelect>
                {region && !AWS_REGIONS.some((r) => r.code === region) && (
                  <p className="text-xs text-destructive">
                    {region} isn&apos;t a supported region — pick one from the
                    list before saving.
                  </p>
                )}
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

        <TabsContent value="observability" className="space-y-4">
          {productionEnv ? (
            <ObservabilitySources
              projectId={project.id}
              envId={productionEnv.id}
            />
          ) : (
            <div className="rounded-lg border border-border bg-card p-5 max-w-lg">
              <p className="text-xs text-muted-foreground">
                No production environment yet — connect sources after the first
                deploy.
              </p>
            </div>
          )}
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
