"use client";

import { useEffect, useState } from "react";
import type {
  HeizenConfig,
  ServiceConfig,
  ServiceType,
  DbSize,
  CacheSize,
  NatMode,
} from "@heizen/shared";
import { FARGATE_CPU_OPTIONS, formatMemoryMb } from "@heizen/shared";
import { X, Copy, Check, Plus } from "lucide-react";
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

const DB_SIZES: { value: DbSize; label: string }[] = [
  { value: "micro", label: "Micro   (~$15/mo)" },
  { value: "small", label: "Small   (~$30/mo)" },
  { value: "medium", label: "Medium  (~$60/mo)" },
  { value: "large", label: "Large   (~$120/mo)" },
];

const CACHE_SIZES: { value: CacheSize; label: string }[] = [
  { value: "micro", label: "Micro  (~$13/mo)" },
  { value: "small", label: "Small  (~$26/mo)" },
  { value: "medium", label: "Medium (~$52/mo)" },
];

const DEFAULT_SERVICE: ServiceConfig = {
  name: "app",
  type: "backend",
  port: 3000,
  cpu: 256,
  memory: 512,
  scaling: { min: 1, max: 3, cpuTarget: 70 },
  command: "node dist/main.js",
  healthCheck: { path: "/health", codes: "200" },
};

const LEGACY_CPU: Record<string, { cpu: number; memory: number }> = {
  small: { cpu: 256, memory: 512 },
  medium: { cpu: 512, memory: 1024 },
  large: { cpu: 1024, memory: 2048 },
};

function normalizeConfig(cfg: HeizenConfig): HeizenConfig {
  return {
    ...cfg,
    services: cfg.services.map((service) => {
      const rawCpu = service.cpu as unknown;
      if (typeof rawCpu === "string" && rawCpu in LEGACY_CPU) {
        const legacy = LEGACY_CPU[rawCpu]!;
        return {
          ...service,
          cpu: legacy.cpu,
          memory: service.memory ?? legacy.memory,
        };
      }
      return {
        ...service,
        memory: service.memory ?? 512,
      };
    }),
  };
}

interface ServiceCardProps {
  service: ServiceConfig;
  onUpdate: (patch: Partial<ServiceConfig>) => void;
  onRemove?: () => void;
}

function ServiceCard({ service, onUpdate, onRemove }: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const cpuOption =
    FARGATE_CPU_OPTIONS.find((o) => o.cpu === service.cpu) ??
    FARGATE_CPU_OPTIONS[0]!;

  const isWorker = service.type === "worker";

  return (
    <div className="rounded-lg border border-border bg-card/50">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Input
          value={service.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-7 w-28 text-xs font-mono"
          placeholder="service-name"
        />
        <select
          value={service.type}
          onChange={(e) => {
            const type = e.target.value as ServiceType;
            onUpdate({
              type,
              port: type === "worker" ? undefined : (service.port ?? 3000),
            });
          }}
          className="h-7 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="backend">backend</option>
          <option value="frontend">frontend</option>
          <option value="worker">worker</option>
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground/90"
        >
          {expanded ? "▲ less" : "▼ more"}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground/70 hover:text-destructive"
            aria-label="Remove service"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/50 px-3 pb-3 pt-2">
        {!isWorker && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Port{" "}
              {service.port === undefined ? (
                <span className="text-warning-foreground">⚠ required</span>
              ) : null}
            </p>
            <Input
              type="number"
              value={service.port ?? ""}
              onChange={(e) =>
                onUpdate({
                  port: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="3000"
              className="h-7 text-xs font-mono"
            />
          </div>
        )}
        <div className={isWorker ? "col-span-2" : ""}>
          <p className="mb-1 text-xs text-muted-foreground">Start command</p>
          <Input
            value={service.command}
            onChange={(e) => onUpdate({ command: e.target.value })}
            placeholder="node dist/main.js"
            className="h-7 text-xs font-mono"
          />
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border/50 px-3 pb-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">vCPU</p>
              <select
                value={service.cpu}
                onChange={(e) => {
                  const cpu = Number(e.target.value);
                  const opt = FARGATE_CPU_OPTIONS.find((o) => o.cpu === cpu)!;
                  const mem = (opt.memoryOptions as readonly number[]).includes(
                    service.memory,
                  )
                    ? service.memory
                    : opt.memoryOptions[0]!;
                  onUpdate({ cpu, memory: mem });
                }}
                className="flex h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
              >
                {FARGATE_CPU_OPTIONS.map((o) => (
                  <option key={o.cpu} value={o.cpu}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Memory</p>
              <select
                value={service.memory}
                onChange={(e) => onUpdate({ memory: Number(e.target.value) })}
                className="flex h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
              >
                {cpuOption.memoryOptions.map((mb) => (
                  <option key={mb} value={mb}>
                    {formatMemoryMb(mb)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Min</p>
              <Input
                type="number"
                value={service.scaling.min}
                onChange={(e) =>
                  onUpdate({
                    scaling: { ...service.scaling, min: Number(e.target.value) },
                  })
                }
                className="h-7 text-xs"
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Max</p>
              <Input
                type="number"
                value={service.scaling.max}
                onChange={(e) =>
                  onUpdate({
                    scaling: { ...service.scaling, max: Number(e.target.value) },
                  })
                }
                className="h-7 text-xs"
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">CPU target %</p>
              <Input
                type="number"
                value={service.scaling.cpuTarget}
                onChange={(e) =>
                  onUpdate({
                    scaling: {
                      ...service.scaling,
                      cpuTarget: Number(e.target.value),
                    },
                  })
                }
                className="h-7 text-xs"
              />
            </div>
          </div>
          {!isWorker && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Health check path</p>
                <Input
                  value={service.healthCheck?.path ?? "/health"}
                  onChange={(e) =>
                    onUpdate({
                      healthCheck: {
                        path: e.target.value,
                        codes: service.healthCheck?.codes ?? "200",
                      },
                    })
                  }
                  className="h-7 text-xs font-mono"
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Success codes</p>
                <Input
                  value={service.healthCheck?.codes ?? "200"}
                  onChange={(e) =>
                    onUpdate({
                      healthCheck: {
                        path: service.healthCheck?.path ?? "/health",
                        codes: e.target.value,
                      },
                    })
                  }
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const [config, setConfig] = useState<HeizenConfig>(() =>
    normalizeConfig(initialConfig),
  );
  const [awsAccountId, setAwsAccountId] = useState("");
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState("");
  const [imageUriError, setImageUriError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [copiedEnvId, setCopiedEnvId] = useState(false);
  const [missingCount, setMissingCount] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    api<Array<{ hasValue: boolean; isAutoGenerated: boolean; dismissed: boolean }>>(
      `/api/projects/${projectId}/environments/${environmentId}/env-vars`,
    )
      .then((vars) => {
        if (!cancelled) {
          setMissingCount(
            vars.filter((v) => !v.isAutoGenerated && !v.dismissed && !v.hasValue).length,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, environmentId]);

  const goToStep = (n: number) => {
    setDeployError(null);
    setStep(n);
  };

  const updateConfig = (patch: Partial<HeizenConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const updateService = (index: number, patch: Partial<ServiceConfig>) =>
    updateConfig({
      services: config.services.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    });

  const addService = () =>
    updateConfig({
      services: [
        ...config.services,
        { ...DEFAULT_SERVICE, name: `service-${config.services.length + 1}` },
      ],
    });

  const removeService = (index: number) =>
    updateConfig({
      services: config.services.filter((_, i) => i !== index),
    });

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

  const missingPorts = config.services.some(
    (s) => s.type !== "worker" && !s.port,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-border bg-card p-5">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Deploy to {envType} — Step {step}/3
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {deployError && (
          <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {deployError}
          </p>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="rounded-md border border-foreground/20 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              {missingPorts
                ? "⚠ Ports were not detected — fill them in below before deploying."
                : "Review and edit your configuration. All fields are customizable."}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Services</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addService}
                  className="gap-1.5 text-xs"
                >
                  <Plus size={12} /> Add Service
                </Button>
              </div>

              {config.services.map((service, idx) => (
                <ServiceCard
                  key={idx}
                  service={service}
                  onUpdate={(patch) => updateService(idx, patch)}
                  onRemove={
                    config.services.length > 1 ? () => removeService(idx) : undefined
                  }
                />
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Infrastructure</p>

              <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="db-toggle"
                    checked={config.database.engine === "postgres"}
                    onChange={(e) =>
                      updateConfig({
                        database: {
                          ...config.database,
                          engine: e.target.checked ? "postgres" : "none",
                        },
                      })
                    }
                    className="h-3.5 w-3.5 rounded"
                  />
                  <label htmlFor="db-toggle" className="cursor-pointer text-sm font-medium">
                    PostgreSQL
                  </label>
                </div>
                {config.database.engine === "postgres" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Instance size</p>
                      <select
                        value={config.database.size ?? "micro"}
                        onChange={(e) =>
                          updateConfig({
                            database: {
                              ...config.database,
                              size: e.target.value as DbSize,
                            },
                          })
                        }
                        className="flex h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                      >
                        {DB_SIZES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">DB name</p>
                      <Input
                        value={config.database.dbName ?? ""}
                        onChange={(e) =>
                          updateConfig({
                            database: { ...config.database, dbName: e.target.value },
                          })
                        }
                        placeholder="myapp_db"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="redis-toggle"
                    checked={config.cache.engine === "redis"}
                    onChange={(e) =>
                      updateConfig({
                        cache: { engine: e.target.checked ? "redis" : "none" },
                      })
                    }
                    className="h-3.5 w-3.5 rounded"
                  />
                  <label htmlFor="redis-toggle" className="cursor-pointer text-sm font-medium">
                    Redis
                  </label>
                </div>
                {config.cache.engine === "redis" && (
                  <select
                    value={config.cache.size ?? "micro"}
                    onChange={(e) =>
                      updateConfig({
                        cache: { ...config.cache, size: e.target.value as CacheSize },
                      })
                    }
                    className="flex h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  >
                    {CACHE_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    id="s3-toggle"
                    checked={config.storage.enabled}
                    onChange={(e) =>
                      updateConfig({ storage: { enabled: e.target.checked } })
                    }
                    className="h-3.5 w-3.5 rounded"
                  />
                  <label htmlFor="s3-toggle" className="cursor-pointer text-sm">
                    S3 Storage
                  </label>
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    id="alb-toggle"
                    checked={config.loadBalancer.enabled}
                    onChange={(e) =>
                      updateConfig({ loadBalancer: { enabled: e.target.checked } })
                    }
                    className="h-3.5 w-3.5 rounded"
                  />
                  <label htmlFor="alb-toggle" className="cursor-pointer text-sm">
                    Load Balancer
                  </label>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Networking</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Region</Label>
                  <Input
                    value={config.region}
                    onChange={(e) => updateConfig({ region: e.target.value })}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">NAT Gateway</Label>
                  <select
                    value={config.networking.nat}
                    onChange={(e) =>
                      updateConfig({
                        networking: {
                          ...config.networking,
                          nat: e.target.value as NatMode,
                        },
                      })
                    }
                    className="mt-1 flex h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="none">None ($0/mo)</option>
                    <option value="single">Single NAT (~$35/mo)</option>
                    <option value="dual">Dual HA NAT (~$70/mo)</option>
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-xs">
                  Domain <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  value={config.domain ?? ""}
                  onChange={(e) =>
                    updateConfig({ domain: e.target.value || undefined })
                  }
                  placeholder="app.example.com"
                  className="mt-1 h-8 text-xs"
                />
              </div>
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
                    <Check size={14} className="text-success" />
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
            {verifyResult && <p className="text-sm text-success">{verifyResult}</p>}
            {verifyError && <p className="text-sm text-destructive">{verifyError}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => goToStep(1)}>
                Back
              </Button>
              <Button size="sm" onClick={() => goToStep(3)} className="flex-1">
                Next: Review
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
                <p className="mt-1.5 text-xs text-destructive">{imageUriError}</p>
              )}
            </div>
            <div className="space-y-1 rounded-md border border-border bg-background p-4 text-sm">
              <p>Region: {config.region}</p>
              <p>Domain: {config.domain || "None"}</p>
              <p>Services: {config.services.map((s) => s.name).join(", ")}</p>
              <p>Database: {config.database.engine}</p>
              <p>Cache: {config.cache.engine}</p>
            </div>
            <CostEstimator config={config} />
            <Separator />
            {missingCount > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
                <p className="text-sm font-medium text-warning-foreground">
                  ⚠ {missingCount} secret{missingCount !== 1 ? "s" : ""} have no value
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open Secrets Manager to fill them in before deploying.
                  Your app will receive empty strings for these keys at runtime.
                </p>
              </div>
            )}
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
                  void deploy();
                }}
                disabled={deploying}
                className="flex-1"
              >
                {deploying ? "Deploying..." : `Deploy to ${envType}`}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
