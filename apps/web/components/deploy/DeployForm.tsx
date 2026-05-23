"use client";

import { useState } from "react";
import type { HeizenConfig } from "@heizen/shared";
import { Button, Card, Input, Label } from "@/components/ui";
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
  const [envVars, setEnvVars] = useState<
    Array<{ service: string; key: string; value: string }>
  >([]);
  const [deploying, setDeploying] = useState(false);

  const updateConfig = (patch: Partial<HeizenConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const verifyAws = async () => {
    await api(`/api/projects/${projectId}/environments/${environmentId}`, {
      method: "PATCH",
      body: JSON.stringify({ awsAccountId, awsRoleArn, region: config.region }),
    });
    const res = await api<{ ok: boolean; message: string }>(
      `/api/projects/${projectId}/environments/${environmentId}/aws/verify`,
      { method: "POST" },
    );
    setVerifyResult(res.message);
  };

  const deploy = async () => {
    setDeploying(true);
    try {
      await api(`/api/projects/${projectId}/environments/${environmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          awsAccountId,
          awsRoleArn,
          region: config.region,
          domain: config.domain,
          heizenConfig: config,
        }),
      });

      if (envVars.length > 0) {
        await api(
          `/api/projects/${projectId}/environments/${environmentId}/env-vars/bulk`,
          { method: "PUT", body: JSON.stringify({ vars: envVars }) },
        );
      }

      const deployment = await api<{ id: string }>(
        `/api/projects/${projectId}/environments/${environmentId}/deployments`,
        { method: "POST", body: JSON.stringify({}) },
      );
      onDeploy(deployment.id);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Deploy to {envType} — Step {step}/4
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white">
            Close
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Region</Label>
              <Input
                value={config.region}
                onChange={(e) => updateConfig({ region: e.target.value })}
              />
            </div>
            <div>
              <Label>Domain</Label>
              <Input
                value={config.domain ?? ""}
                onChange={(e) => updateConfig({ domain: e.target.value })}
                placeholder="app.example.com"
              />
            </div>
            <div>
              <Label>NAT Gateway</Label>
              <select
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
            <Button onClick={() => setStep(2)} className="w-full">
              Next: AWS Access
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>AWS Account ID</Label>
              <Input value={awsAccountId} onChange={(e) => setAwsAccountId(e.target.value)} />
            </div>
            <div>
              <Label>IAM Role ARN</Label>
              <Input value={awsRoleArn} onChange={(e) => setAwsRoleArn(e.target.value)} />
            </div>
            <details className="text-sm text-[var(--muted)]">
              <summary className="cursor-pointer">How to create the IAM role</summary>
              <p className="mt-2">
                Create an IAM role in your AWS account that trusts the Heizen platform account
                with an external ID equal to your environment ID. Grant it AdministratorAccess
                or scoped permissions for ECS, RDS, ElastiCache, S3, ALB, and IAM.
              </p>
            </details>
            <Button onClick={verifyAws} variant="outline">
              Test Connection
            </Button>
            {verifyResult && (
              <p className="text-sm text-[var(--success)]">{verifyResult}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                Next: Environment Variables
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              Provide values for secrets detected from .env.example files.
            </p>
            {envVars.map((v, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <Input value={v.service} readOnly />
                <Input value={v.key} readOnly />
                <Input
                  type="password"
                  value={v.value}
                  onChange={(e) => {
                    const next = [...envVars];
                    next[i] = { ...v, value: e.target.value };
                    setEnvVars(next);
                  }}
                />
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setEnvVars([...envVars, { service: "shared", key: "", value: "" }])
              }
            >
              Add Variable
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1">
                Next: Review
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-md bg-zinc-900 p-4 text-sm space-y-1">
              <p>Region: {config.region}</p>
              <p>Domain: {config.domain || "None"}</p>
              <p>Services: {config.services.map((s) => s.name).join(", ")}</p>
              <p>Database: {config.database.engine}</p>
              <p>Cache: {config.cache.engine}</p>
            </div>
            <CostEstimator config={config} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={deploy} disabled={deploying} className="flex-1">
                {deploying ? "Deploying..." : `Deploy to ${envType}`}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
