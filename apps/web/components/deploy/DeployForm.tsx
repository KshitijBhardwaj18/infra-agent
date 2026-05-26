"use client";

import { useEffect, useState } from "react";
import type { HeizenConfig } from "@heizen/shared";
import { X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CostEstimator } from "./CostEstimator";
import { api } from "@/lib/api";

interface Props {
  projectId: string;
  environmentId: string;
  envType: "staging" | "production";
  initialConfig: HeizenConfig;
  onDeploy: (deploymentId: string) => void;
  onClose: () => void;
}

export function DeployForm({
  projectId,
  environmentId,
  envType,
  initialConfig,
  onDeploy,
  onClose,
}: Props) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<HeizenConfig>(initialConfig);
  const [awsAccountId, setAwsAccountId] = useState("");
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState("");
  const [imageUriError, setImageUriError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [copiedEnvId, setCopiedEnvId] = useState(false);

  const copyEnvironmentId = async () => {
    await navigator.clipboard.writeText(environmentId);
    setCopiedEnvId(true);
    setTimeout(() => setCopiedEnvId(false), 2000);
  };

  useEffect(() => {
    api<{
      awsAccountId: string | null;
      awsRoleArn: string | null;
      region: string | null;
      imageUri: string | null;
    }>(`/api/projects/${projectId}/environments/${environmentId}`)
      .then((env) => {
        if (env.awsAccountId) setAwsAccountId(env.awsAccountId);
        if (env.awsRoleArn) setAwsRoleArn(env.awsRoleArn);
        if (env.imageUri) setImageUri(env.imageUri);
      })
      .catch(() => {});
  }, [projectId, environmentId]);

  const goToStep = (n: number) => {
    setDeployError(null);
    setStep(n);
  };

  const updateConfig = (patch: Partial<HeizenConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const verifyAws = async () => {
    setVerifyResult(null);
    setVerifyError(null);
    try {
      await api(`/api/projects/${projectId}/environments/${environmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ awsAccountId, awsRoleArn, region: config.region }),
      });
      const res = await api<{ ok: boolean; message: string }>(
        `/api/projects/${projectId}/environments/${environmentId}/aws/verify`,
        { method: "POST" },
      );
      setVerifyResult(res.message);
    } catch (err) {
      setVerifyError(
        err instanceof Error
          ? err.message
          : "Connection failed. Check role ARN and trust policy.",
      );
    }
  };

  const deploy = async () => {
    if (!awsRoleArn.trim()) {
      setDeployError("IAM Role ARN is required.");
      setStep(2);
      return;
    }
    if (!config.region.trim()) {
      setDeployError("Region is required.");
      setStep(1);
      return;
    }
    if (!imageUri.trim()) {
      setDeployError("Docker image URI is required.");
      setStep(3);
      return;
    }

    setDeploying(true);
    setDeployError(null);

    try {
      await api(`/api/projects/${projectId}/environments/${environmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          awsAccountId,
          awsRoleArn,
          region: config.region,
          domain: config.domain,
          heizenConfig: config,
          imageUri,
        }),
      });

      const deployment = await api<{ id: string }>(
        `/api/projects/${projectId}/environments/${environmentId}/deployments`,
        { method: "POST", body: JSON.stringify({}) },
      );
      onDeploy(deployment.id);
    } catch (err) {
      setDeployError(
        err instanceof Error ? err.message : "Deployment failed. Check your configuration.",
      );
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Deploy to {envType} — Step {step}/4
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {deployError && (
          <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {deployError}
          </p>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Region</Label>
              <Input
                value={config.region}
                onChange={(e) => updateConfig({ region: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Domain</Label>
              <Input
                value={config.domain ?? ""}
                onChange={(e) => updateConfig({ domain: e.target.value })}
                placeholder="app.example.com"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>NAT Gateway</Label>
              <select
                className="mt-1.5 flex h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm"
                value={config.networking.nat}
                onChange={(e) =>
                  updateConfig({
                    networking: {
                      ...config.networking,
                      nat: e.target.value as HeizenConfig["networking"]["nat"],
                    },
                  })
                }
              >
                <option value="none">None ($0)</option>
                <option value="single">Single ($35)</option>
                <option value="dual">Dual HA ($70)</option>
              </select>
            </div>
            <CostEstimator config={config} />
            <Button size="sm" onClick={() => goToStep(2)} className="w-full">
              Next: AWS Access
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Environment ID</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Use this as the External ID in your IAM role trust policy.
              </p>
              <div className="mt-1.5 flex gap-2">
                <Input value={environmentId} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={copyEnvironmentId}
                  className="shrink-0"
                  aria-label="Copy environment ID"
                >
                  {copiedEnvId ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Label>AWS Account ID</Label>
              <Input
                value={awsAccountId}
                onChange={(e) => setAwsAccountId(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>IAM Role ARN</Label>
              <Input
                value={awsRoleArn}
                onChange={(e) => setAwsRoleArn(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                How to create the IAM role
              </summary>
              <p className="mt-2 leading-relaxed">
                Create an IAM role in your AWS account that trusts the Heizen platform AWS
                account (<code className="text-foreground">PLATFORM_AWS_ACCOUNT_ID</code>) with an
                external ID equal to the environment ID above. Grant it AdministratorAccess or
                scoped permissions for ECS, RDS, ElastiCache, S3, ALB, and IAM.
              </p>
            </details>
            <Button size="sm" onClick={verifyAws} variant="outline">
              Test connection
            </Button>
            {verifyResult && <p className="text-sm text-green-500">{verifyResult}</p>}
            {verifyError && <p className="text-sm text-red-400">{verifyError}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => goToStep(1)}>
                Back
              </Button>
              <Button size="sm" onClick={() => goToStep(3)} className="flex-1">
                Next: Docker Image
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label>ECR Image URI</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                The full ECR image URI to deploy, including the tag.
              </p>
              <Input
                value={imageUri}
                onChange={(e) => setImageUri(e.target.value)}
                placeholder="123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:v1.2.3"
                className="mt-1.5 font-mono text-xs"
              />
              {imageUriError && (
                <p className="mt-1.5 text-xs text-red-400">{imageUriError}</p>
              )}
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-zinc-400">Don&apos;t have an image yet?</p>
              <p>Push one to ECR from your CI/CD pipeline or locally:</p>
              <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">
                {`aws ecr get-login-password | docker login --password-stdin ...\ndocker build -t YOUR_REPO:TAG .\ndocker push YOUR_REPO:TAG`}
              </pre>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => goToStep(2)}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!imageUri.trim()) {
                    setImageUriError("Image URI is required.");
                    return;
                  }
                  if (!imageUri.includes(".dkr.ecr.") || !imageUri.includes("/")) {
                    setImageUriError(
                      "Must be a valid ECR URI (e.g. 123456.dkr.ecr.us-east-1.amazonaws.com/app:tag)",
                    );
                    return;
                  }
                  setImageUriError(null);
                  goToStep(4);
                }}
                className="flex-1"
              >
                Next: Review
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1 rounded-md border border-zinc-800 bg-zinc-950 p-4 text-sm">
              <p>Region: {config.region}</p>
              <p>Domain: {config.domain || "None"}</p>
              <p>Image: {imageUri}</p>
              <p>Services: {config.services.map((s) => s.name).join(", ")}</p>
              <p>Database: {config.database.engine}</p>
              <p>Cache: {config.cache.engine}</p>
            </div>
            <CostEstimator config={config} />
            <Separator />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => goToStep(3)}>
                Back
              </Button>
              <Button size="sm" onClick={deploy} disabled={deploying} className="flex-1">
                {deploying ? "Deploying..." : `Deploy to ${envType}`}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
