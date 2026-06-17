"use client";

import { useEffect, useState } from "react";
import type {
  HeizenConfig,
  ServiceConfig,
  ServiceType,
  DbSize,
  CacheSize,
  NatMode,
  DeployStrategy,
} from "@heizen/shared";
import {
  FARGATE_CPU_OPTIONS,
  formatMemoryMb,
  AWS_REGIONS,
  isLightsailRegion,
  isValidCidr,
  DEFAULT_REGION,
} from "@heizen/shared";
import { X, Copy, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CostEstimator } from "./CostEstimator";
import { LightsailRoutingSection } from "./LightsailRoutingSection";
import { OpenPortsSection } from "./OpenPortsSection";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ParsedCompose } from "@heizen/shared";

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

// EC2 instance types offered for the single-VM (EC2_COMPOSE) target.
// RAM is the knob that matters — Docker, Caddy, and the user's services
// share it. Rough on-demand pricing for orientation.
const EC2_INSTANCE_TYPES: { value: string; label: string }[] = [
  { value: "t3.small", label: "t3.small — 2 vCPU / 2 GB (~$15/mo)" },
  { value: "t3.medium", label: "t3.medium — 2 vCPU / 4 GB (~$30/mo)" },
  { value: "t3.large", label: "t3.large — 2 vCPU / 8 GB (~$60/mo)" },
  { value: "t3.xlarge", label: "t3.xlarge — 4 vCPU / 16 GB (~$120/mo)" },
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

/**
 * Mirrors context.ts `defaultService` logic. First frontend with a port
 * is the ALB's default target; first backend with a port if no
 * frontend exists. All OTHER port-exposing non-worker services need
 * a domain to be reachable through the ALB.
 */
function findDefaultServiceName(services: ServiceConfig[]): string | null {
  const albEligible = services.filter(
    (s) => s.type !== "worker" && s.port != null,
  );
  return (
    albEligible.find((s) => s.type === "frontend")?.name ??
    albEligible.find((s) => s.type === "backend")?.name ??
    albEligible[0]?.name ??
    null
  );
}

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

/**
 * Per-service public-access row — sits between the always-visible
 * port/command row and the ▼-more advanced block. Three states based
 * on service shape:
 *
 *   default route   → checkbox checked + locked, domain input optional
 *                     and labeled "extra host rule".
 *   exposed         → checkbox togglable, domain input required.
 *                     Empty input → warning copy + warning-color border.
 *   not exposed     → checkbox off, domain hidden. ALB won't route to it.
 *
 * Workers don't render this row (parent decides) — they're not on the ALB.
 */
function PublicAccessRow({
  service,
  isDefaultRoute,
  domainRequired,
  domainMissingWarning,
  onChange,
}: {
  service: ServiceConfig;
  isDefaultRoute: boolean;
  domainRequired: boolean;
  domainMissingWarning?: string;
  onChange: (domain: string) => void;
}) {
  // "Exposed" means the user wants the ALB to route to this service.
  // For default route, this is always true and uncheckable. For others,
  // having a domain set IS the exposure signal.
  const exposed = isDefaultRoute || !!service.domain;
  // Toggling off for non-default services clears the domain (which
  // removes the listener rule). Toggling on prompts for a domain.
  const handleToggle = (next: boolean) => {
    if (isDefaultRoute) return; // locked on
    if (!next) onChange(""); // clear domain → unexpose
    // turning on with no domain is fine — the field below now shows
    // the warning until they type one in.
  };

  return (
    <div className="border-t border-border/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={exposed}
            disabled={isDefaultRoute}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded"
          />
          <span className="font-medium">Expose via ALB</span>
          {isDefaultRoute && (
            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              default route
            </span>
          )}
        </label>
        {exposed && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {service.port ? `:${service.port}` : ""}
          </span>
        )}
      </div>

      {exposed && (
        <div className="mt-2 space-y-1">
          <Input
            value={service.domain ?? ""}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder={isDefaultRoute ? "optional override" : "api.example.com"}
            className={cn(
              "h-7 text-xs font-mono",
              !isDefaultRoute && domainRequired && !service.domain && "border-warning",
            )}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-[10px] text-muted-foreground">
            {isDefaultRoute ? (
              <>
                This service gets the ALB&apos;s default route. Adding a
                domain registers an extra host-rule on top of that.
              </>
            ) : domainRequired && !service.domain ? (
              <span className="text-warning-foreground">
                {domainMissingWarning ??
                  "Without a domain, this service won't be reachable via the ALB."}
              </span>
            ) : (
              <>
                Point a CNAME at the ALB DNS (shown on the env page after
                deploy). HTTPS goes through Cloudflare in front.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

interface ServiceCardProps {
  service: ServiceConfig;
  onUpdate: (patch: Partial<ServiceConfig>) => void;
  onRemove?: () => void;
  /** This service is the ALB's default route target — it gets traffic
   *  with any (or unmatched) host header. Domain is optional and acts
   *  as an extra host-rule on top of the default. */
  isDefaultRoute?: boolean;
  /** True when this service won't be reachable through the ALB unless
   *  it has a domain (i.e. it's a non-default port-having service). */
  domainRequired?: boolean;
  /** When domainRequired and domain is missing — the parent computes
   *  this so the warning copy is consistent across the form. */
  domainMissingWarning?: string;
}

function ServiceCard({
  service,
  onUpdate,
  onRemove,
  isDefaultRoute,
  domainRequired,
  domainMissingWarning,
}: ServiceCardProps) {
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
        <NativeSelect
          value={service.type}
          onChange={(e) => {
            const type = e.target.value as ServiceType;
            onUpdate({
              type,
              port: type === "worker" ? undefined : (service.port ?? 3000),
            });
          }}
          className="h-7 w-32"
        >
          <option value="backend">backend</option>
          <option value="frontend">frontend</option>
          <option value="worker">worker</option>
        </NativeSelect>
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

      {/* ── Public access ─────────────────────────────────────────
          Always visible (not buried behind ▼ more) so users can't miss
          the requirement that a 2nd frontend needs a domain. Workers
          can't be exposed via the ALB at all; render a one-line note. */}
      {isWorker ? (
        <div className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
          Worker — runs in the cluster, not publicly accessible.
        </div>
      ) : (
        <PublicAccessRow
          service={service}
          isDefaultRoute={!!isDefaultRoute}
          domainRequired={!!domainRequired}
          domainMissingWarning={domainMissingWarning}
          onChange={(domain) => onUpdate({ domain: domain || undefined })}
        />
      )}

      {expanded && (
        <div className="space-y-3 border-t border-border/50 px-3 pb-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">vCPU</p>
              <NativeSelect
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
                className="h-7"
              >
                {FARGATE_CPU_OPTIONS.map((o) => (
                  <option key={o.cpu} value={o.cpu}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Memory</p>
              <NativeSelect
                value={service.memory}
                onChange={(e) => onUpdate({ memory: Number(e.target.value) })}
                className="h-7"
              >
                {cpuOption.memoryOptions.map((mb) => (
                  <option key={mb} value={mb}>
                    {formatMemoryMb(mb)}
                  </option>
                ))}
              </NativeSelect>
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
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState("");
  const [imageUriError, setImageUriError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [copiedEnvId, setCopiedEnvId] = useState(false);
  const [missingCount, setMissingCount] = useState(0);
  const [compose, setCompose] = useState<ParsedCompose | null>(null);
  // ECR images available in the customer account — populate the per-service
  // image dropdowns on compose targets. Loaded lazily when the review step
  // opens (and on demand via Refresh).
  const [ecrImages, setEcrImages] = useState<string[]>([]);
  const [ecrLoading, setEcrLoading] = useState(false);
  const [ecrError, setEcrError] = useState<string | null>(null);
  const [deployStrategy, setDeployStrategy] = useState<DeployStrategy>(
    envType === "production" ? "ECS" : "LIGHTSAIL",
  );
  const [ec2InstanceType, setEc2InstanceType] = useState("t3.medium");

  // Compose-based templates (EC2 + Lightsail) drive the routing/Caddy UI
  // and skip the ECS image-URI field. EC2 additionally exposes managed
  // RDS/S3 toggles + an instance type.
  const isEc2 = deployStrategy === "EC2_COMPOSE";
  const isCompose =
    deployStrategy === "EC2_COMPOSE" || deployStrategy === "LIGHTSAIL";

  // The AWS account ID is read straight off the role ARN — no separate
  // form field. Backend derives + stores the same value on save.
  const derivedAccountId =
    /^arn:aws:iam::(\d{12}):role\//.exec(awsRoleArn.trim())?.[1] ?? null;
  // A non-empty ARN that doesn't parse means the user mistyped it.
  const arnInvalid = awsRoleArn.trim().length > 0 && !derivedAccountId;

  // Lightsail isn't available in every AWS region, so narrow the picker to
  // its supported set; ECS/EC2 can use any commercial region.
  const regionOptions =
    deployStrategy === "LIGHTSAIL"
      ? AWS_REGIONS.filter((r) => isLightsailRegion(r.code))
      : AWS_REGIONS;
  // Blocks deploy: a Lightsail target on a region Lightsail can't run in.
  const lightsailRegionInvalid =
    deployStrategy === "LIGHTSAIL" &&
    !!config.region &&
    !isLightsailRegion(config.region);

  // Blocks deploy: a configured open port outside 1–65535, or a malformed
  // CIDR that would produce a broken security-group rule.
  const openPortsInvalid = (config.openPorts ?? []).some(
    (p) =>
      !Number.isInteger(p.port) ||
      p.port < 1 ||
      p.port > 65535 ||
      (!!p.cidr && !isValidCidr(p.cidr)),
  );

  // Never leave the region blank — the backend requires a valid one and the
  // dropdown would otherwise show a phantom selection.
  useEffect(() => {
    if (!config.region) updateConfig({ region: DEFAULT_REGION });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.region]);

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
      composeServicesCache: ParsedCompose | null;
      deployStrategy: DeployStrategy | null;
      ec2InstanceType: string | null;
    }>(`/api/projects/${projectId}/environments/${environmentId}`)
      .then((env) => {
        if (env.awsRoleArn) setAwsRoleArn(env.awsRoleArn);
        if (env.imageUri) setImageUri(env.imageUri);
        if (env.composeServicesCache) setCompose(env.composeServicesCache);
        if (env.deployStrategy) setDeployStrategy(env.deployStrategy);
        if (env.ec2InstanceType) setEc2InstanceType(env.ec2InstanceType);
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

  // Per-service image override (serviceName -> ECR ref). An empty ref clears
  // the override so the service falls back to its compose `image:`. We drop
  // the whole map when no overrides remain to keep the config tidy.
  const setImageOverride = (serviceName: string, ref: string) =>
    setConfig((c) => {
      const next = { ...(c.imageOverrides ?? {}) };
      if (ref) next[serviceName] = ref;
      else delete next[serviceName];
      return {
        ...c,
        imageOverrides: Object.keys(next).length > 0 ? next : undefined,
      };
    });

  // Loads ECR images for the dropdowns. Persists role+region first so the
  // backend can assume the role to enumerate the registry (the same fields
  // the deploy writes anyway), then fetches the catalog.
  const loadEcrImages = async (signal?: AbortSignal) => {
    if (!awsRoleArn.trim() || !config.region.trim()) {
      setEcrError("Add the IAM role ARN (step 2) and region first.");
      return;
    }
    setEcrLoading(true);
    setEcrError(null);
    try {
      await api(`/api/projects/${projectId}/environments/${environmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ awsRoleArn, region: config.region }),
        signal,
      });
      const res = await api<{ images: string[] }>(
        `/api/projects/${projectId}/environments/${environmentId}/ecr/images`,
        { signal },
      );
      if (!signal?.aborted) setEcrImages(res.images);
    } catch (err) {
      // Don't surface an error for a request we cancelled ourselves
      // (component unmounted / step changed mid-flight).
      if (signal?.aborted) return;
      setEcrError(
        err instanceof Error
          ? err.message
          : "Couldn't load ECR images. Check the role's ECR permissions.",
      );
    } finally {
      setEcrLoading(false);
    }
  };

  // Auto-load the ECR catalog once the review step opens on a compose target
  // with credentials in hand. The AbortController cancels the in-flight
  // request if the user leaves before it resolves. Manual Refresh re-runs
  // loadEcrImages (no signal — it owns its own lifecycle).
  useEffect(() => {
    if (step !== 3 || !isCompose) return;
    if (!awsRoleArn.trim() || !config.region.trim()) return;
    if (ecrImages.length > 0 || ecrLoading || ecrError) return;
    const controller = new AbortController();
    void loadEcrImages(controller.signal);
    return () => controller.abort();
    // loadEcrImages is intentionally excluded — run once when the step opens
    // with creds ready; Refresh covers re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isCompose, awsRoleArn, config.region]);

  const verifyAws = async () => {
    setVerifyResult(null);
    setVerifyError(null);
    try {
      await api(`/api/projects/${projectId}/environments/${environmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ awsRoleArn, region: config.region }),
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
    if (lightsailRegionInvalid) {
      setDeployError(
        `Lightsail isn't available in ${config.region}. Pick a supported region.`,
      );
      setStep(1);
      return;
    }
    if (openPortsInvalid) {
      setDeployError(
        "Each open port needs a valid number (1–65535) and CIDR block.",
      );
      setStep(1);
      return;
    }
    // ECS template needs a single image URI baked into the task def.
    // Lightsail derives images from docker-compose.yml so the field
    // is genuinely optional here.
    if (!isCompose && !imageUri.trim()) {
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
          awsRoleArn,
          region: config.region,
          domain: config.domain,
          heizenConfig: config,
          imageUri,
          deployStrategy,
          ec2InstanceType: isEc2 ? ec2InstanceType : undefined,
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

            {/* Deployment target — production can choose ECS vs a single
                EC2 box; staging is always Lightsail. */}
            {envType === "production" && (
              <div>
                <Label className="text-xs">Deployment target</Label>
                <NativeSelect
                  value={deployStrategy}
                  onChange={(e) =>
                    setDeployStrategy(e.target.value as DeployStrategy)
                  }
                  className="mt-1.5 max-w-md"
                >
                  <option value="ECS">ECS — managed containers (Fargate + ALB)</option>
                  <option value="EC2_COMPOSE">EC2 — single VM, docker-compose</option>
                </NativeSelect>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isEc2
                    ? "One EC2 box running your docker-compose behind Caddy, with managed RDS. Compose is the source of truth; redeploys update in place."
                    : "Each service runs as a Fargate task behind an Application Load Balancer."}
                </p>
              </div>
            )}

            {/* Region — applies to every template. Lightsail is limited to
                the regions it actually supports, so the list narrows there. */}
            <div>
              <Label className="text-xs">Region</Label>
              <NativeSelect
                value={config.region}
                onChange={(e) => updateConfig({ region: e.target.value })}
                className="mt-1.5 max-w-md"
              >
                {regionOptions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} — {r.label}
                  </option>
                ))}
                {/* Keep the stored region selectable even if it's not in the
                    (possibly Lightsail-narrowed) list. */}
                {config.region &&
                  !regionOptions.some((r) => r.code === config.region) && (
                    <option value={config.region}>{config.region}</option>
                  )}
              </NativeSelect>
              {deployStrategy === "LIGHTSAIL" &&
                config.region &&
                !isLightsailRegion(config.region) && (
                  <p className="mt-1 text-[11px] text-destructive">
                    Lightsail isn&apos;t available in {config.region}. Pick a
                    supported region.
                  </p>
                )}
            </div>

            {/* EC2 instance type */}
            {isEc2 && (
              <div>
                <Label className="text-xs">EC2 instance type</Label>
                <NativeSelect
                  value={ec2InstanceType}
                  onChange={(e) => setEc2InstanceType(e.target.value)}
                  className="mt-1.5 max-w-xs"
                >
                  {EC2_INSTANCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {/* EC2 managed-service toggles (subset of the ECS infra: RDS
                + S3; redis stays in the user's compose, no ALB/NAT). */}
            {isEc2 && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                    <label htmlFor="ec2-db" className="cursor-pointer text-sm font-medium">
                      Managed Postgres (RDS)
                    </label>
                    <Switch
                      id="ec2-db"
                      checked={config.database.engine === "postgres"}
                      onCheckedChange={(v) =>
                        updateConfig({
                          database: v
                            ? {
                                ...config.database,
                                engine: "postgres",
                                // Default a size so RDS provisions + costs
                                // correctly; user can change it below.
                                size: config.database.size ?? "micro",
                              }
                            : { ...config.database, engine: "none" },
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                    <label htmlFor="ec2-s3" className="cursor-pointer text-sm font-medium">
                      S3 Storage
                    </label>
                    <Switch
                      id="ec2-s3"
                      checked={config.storage.enabled}
                      onCheckedChange={(v) =>
                        updateConfig({ storage: { enabled: v } })
                      }
                    />
                  </div>
                </div>
                {config.database.engine === "postgres" && (
                  <div>
                    <Label className="text-xs">RDS instance size</Label>
                    <NativeSelect
                      value={config.database.size ?? "micro"}
                      onChange={(e) =>
                        updateConfig({
                          database: {
                            ...config.database,
                            size: e.target.value as DbSize,
                          },
                        })
                      }
                      className="mt-1.5 max-w-xs"
                    >
                      {DB_SIZES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
              </div>
            )}

            {isCompose ? (
              <>
                <LightsailRoutingSection
                  config={config}
                  compose={compose}
                  onConfigChange={updateConfig}
                />
                {deployStrategy === "LIGHTSAIL" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                      <label
                        htmlFor="staticip-toggle"
                        className="cursor-pointer text-sm"
                      >
                        Reserve a static IP
                      </label>
                      <Switch
                        id="staticip-toggle"
                        checked={config.staticIp?.enabled ?? false}
                        onCheckedChange={(v) =>
                          updateConfig({
                            staticIp: { ...config.staticIp, enabled: v },
                          })
                        }
                      />
                    </div>
                    {!(config.staticIp?.enabled ?? false) && (
                      <p className="text-xs text-muted-foreground">
                        The box uses a dynamic public IP that changes whenever it
                        stops and starts — which will break any DNS A-record
                        pointed at it. Turn this on if you&apos;ve set up a
                        domain.
                      </p>
                    )}
                  </div>
                )}
                <OpenPortsSection
                  config={config}
                  onConfigChange={updateConfig}
                />
              </>
            ) : (
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

                {(() => {
                  const defaultName = findDefaultServiceName(config.services);
                  return config.services.map((service, idx) => {
                    const isAlbEligible =
                      service.type !== "worker" && service.port != null;
                    const isDefault =
                      isAlbEligible && service.name === defaultName;
                    // Non-default ALB-eligible services need a domain to
                    // get a ListenerRule generated; without one, the ALB
                    // sends everything to the default service and this
                    // service is unreachable from outside.
                    const domainRequired = isAlbEligible && !isDefault;
                    return (
                      <ServiceCard
                        key={idx}
                        service={service}
                        onUpdate={(patch) => updateService(idx, patch)}
                        onRemove={
                          config.services.length > 1
                            ? () => removeService(idx)
                            : undefined
                        }
                        isDefaultRoute={isDefault}
                        domainRequired={domainRequired}
                        domainMissingWarning={
                          service.type === "frontend"
                            ? "Another frontend is already the default. Set a domain or this app won't be reachable."
                            : "Backends without a domain aren't routed by the ALB. Add one or expose via the default service."
                        }
                      />
                    );
                  });
                })()}
              </div>
            )}

            {!isCompose && (
            <>
            <div className="space-y-3">
              <p className="text-sm font-medium">Infrastructure</p>

              <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="db-toggle" className="cursor-pointer text-sm font-medium">
                    PostgreSQL
                  </label>
                  <Switch
                    id="db-toggle"
                    checked={config.database.engine === "postgres"}
                    onCheckedChange={(v) =>
                      updateConfig({
                        database: {
                          ...config.database,
                          engine: v ? "postgres" : "none",
                        },
                      })
                    }
                  />
                </div>
                {config.database.engine === "postgres" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Instance size</p>
                      <NativeSelect
                        value={config.database.size ?? "micro"}
                        onChange={(e) =>
                          updateConfig({
                            database: {
                              ...config.database,
                              size: e.target.value as DbSize,
                            },
                          })
                        }
                      >
                        {DB_SIZES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </NativeSelect>
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
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="redis-toggle" className="cursor-pointer text-sm font-medium">
                    Redis
                  </label>
                  <Switch
                    id="redis-toggle"
                    checked={config.cache.engine === "redis"}
                    onCheckedChange={(v) =>
                      updateConfig({
                        cache: { engine: v ? "redis" : "none" },
                      })
                    }
                  />
                </div>
                {config.cache.engine === "redis" && (
                  <NativeSelect
                    value={config.cache.size ?? "micro"}
                    onChange={(e) =>
                      updateConfig({
                        cache: { ...config.cache, size: e.target.value as CacheSize },
                      })
                    }
                  >
                    {CACHE_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                  <label htmlFor="s3-toggle" className="cursor-pointer text-sm">
                    S3 Storage
                  </label>
                  <Switch
                    id="s3-toggle"
                    checked={config.storage.enabled}
                    onCheckedChange={(v) =>
                      updateConfig({ storage: { enabled: v } })
                    }
                  />
                </div>
                <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-card/50 px-3 py-2.5">
                  <label htmlFor="alb-toggle" className="cursor-pointer text-sm">
                    Load Balancer
                  </label>
                  <Switch
                    id="alb-toggle"
                    checked={config.loadBalancer.enabled}
                    onCheckedChange={(v) =>
                      updateConfig({ loadBalancer: { enabled: v } })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Observability</p>
              <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
                <Label className="text-xs">Logs destination</Label>
                <NativeSelect
                  value={config.observability?.logsDestination ?? "cloudwatch"}
                  onChange={(e) =>
                    updateConfig({
                      observability: {
                        ...config.observability,
                        logsDestination: e.target.value as
                          | "cloudwatch"
                          | "grafana-loki",
                      },
                    })
                  }
                >
                  <option value="cloudwatch">Managed — CloudWatch (default)</option>
                  <option value="grafana-loki">My Grafana / Loki</option>
                </NativeSelect>
                {config.observability?.logsDestination === "grafana-loki" && (
                  <p className="text-xs text-muted-foreground">
                    Ships container logs to the Grafana/Loki connected under{" "}
                    <span className="font-medium">Settings → Observability</span>.
                    Make sure it has a Loki push URL set.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Networking</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">NAT Gateway</Label>
                  <NativeSelect
                    value={config.networking.nat}
                    onChange={(e) =>
                      updateConfig({
                        networking: {
                          ...config.networking,
                          nat: e.target.value as NatMode,
                        },
                      })
                    }
                    className="mt-1"
                  >
                    <option value="none">None ($0/mo)</option>
                    <option value="single">Single NAT (~$35/mo)</option>
                    <option value="dual">Dual HA NAT (~$70/mo)</option>
                  </NativeSelect>
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
            </>
            )}

            <CostEstimator config={config} deployStrategy={deployStrategy} ec2InstanceType={ec2InstanceType} />

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
              <Label>IAM Role ARN</Label>
              <Input
                value={awsRoleArn}
                onChange={(e) => setAwsRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/heizen-deploy"
                className="mt-1.5 font-mono text-xs"
              />
              <p
                className={cn(
                  "mt-1.5 text-xs",
                  arnInvalid ? "text-destructive" : "text-muted-foreground",
                )}
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
            {isCompose ? (
              // Compose-based targets (Lightsail/EC2) pull images
              // per-service from the user's docker-compose.yml. The
              // platform parses those refs at deploy time and auto-logs
              // into any ECR registries it finds (Lightsail via injected
              // creds, EC2 via the instance role), so no image URI here.
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-card/50 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Service images
                  </p>
                  <p className="mt-1">
                    Pick an image from your account&apos;s ECR for each
                    service, or keep the{" "}
                    <code className="font-mono">image:</code> from
                    docker-compose.yml. Selections are injected into the
                    compose at deploy time, and the VM logs into ECR with
                    your AWS role before pulling.
                  </p>
                </div>

                {compose && compose.services.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        {compose.services.length} service
                        {compose.services.length !== 1 ? "s" : ""}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void loadEcrImages()}
                        disabled={ecrLoading}
                        className="h-6 px-2 text-xs"
                      >
                        {ecrLoading
                          ? "Loading…"
                          : ecrImages.length > 0
                            ? "Refresh ECR"
                            : "Load ECR images"}
                      </Button>
                    </div>

                    {ecrError && (
                      <p className="text-xs text-destructive">{ecrError}</p>
                    )}
                    {!ecrLoading && !ecrError && ecrImages.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        No ECR images found in {config.region || "this region"}.
                        Services will use the{" "}
                        <code className="font-mono">image:</code> from compose.
                      </p>
                    )}

                    {compose.services.map((svc) => {
                      const override = config.imageOverrides?.[svc.name] ?? "";
                      const needsImage = !svc.image && !override;
                      return (
                        <div
                          key={svc.name}
                          className="rounded-md border border-border/60 bg-background px-3 py-2"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-xs font-medium text-foreground">
                              {svc.name}
                            </span>
                            {needsImage ? (
                              <span className="text-[10px] font-medium text-warning-foreground">
                                no image — pick one to deploy
                              </span>
                            ) : override ? (
                              <span className="text-[10px] text-success">
                                overridden
                              </span>
                            ) : null}
                          </div>
                          <NativeSelect
                            value={override}
                            onChange={(e) =>
                              setImageOverride(svc.name, e.target.value)
                            }
                            className={cn(
                              "mt-1.5 font-mono text-xs",
                              needsImage && "border-warning-foreground/50",
                            )}
                          >
                            <option value="">
                              {svc.image
                                ? `Keep compose default — ${svc.image}`
                                : "— no image in compose —"}
                            </option>
                            {/* Keep a previously-chosen ref selectable even
                                if it's not in the freshly-fetched list. */}
                            {override && !ecrImages.includes(override) && (
                              <option value={override}>{override}</option>
                            )}
                            {ecrImages.map((img) => (
                              <option key={img} value={img}>
                                {img}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No services detected yet — deploy once (or re-index the
                    repo) so the platform can parse your docker-compose.yml.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label>ECR Image URI</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  The full ECR image URI to deploy, including the tag.
                  Used by the ECS task definition.
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
            )}
            <div className="space-y-1 rounded-md border border-border bg-background p-4 text-sm">
              <p>Region: {config.region}</p>
              <p>Domain: {config.domain || "None"}</p>
              <p>Services: {config.services.map((s) => s.name).join(", ")}</p>
              <p>Database: {config.database.engine}</p>
              <p>Cache: {config.cache.engine}</p>
            </div>
            <CostEstimator config={config} deployStrategy={deployStrategy} ec2InstanceType={ec2InstanceType} />
            <Separator />
            {missingCount > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <p className="text-sm font-medium text-destructive">
                  ⚠ {missingCount} required secret{missingCount !== 1 ? "s" : ""} {missingCount !== 1 ? "have" : "has"} no value
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deploy is blocked until these are filled in Secrets
                  Manager, or dismissed there if the empty value is
                  intentional.
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
                  if (isCompose) {
                    // Skip ECR URI validation on compose targets —
                    // the compose file owns image refs.
                    setImageUriError(null);
                  } else if (!imageUri.trim()) {
                    setImageUriError("Image URI is required.");
                    return;
                  } else if (!imageUri.includes(".dkr.ecr.") || !imageUri.includes("/")) {
                    setImageUriError(
                      "Must be a valid ECR URI (e.g. 123456.dkr.ecr.us-east-1.amazonaws.com/app:tag)",
                    );
                    return;
                  }
                  setImageUriError(null);
                  void deploy();
                }}
                disabled={
                  deploying ||
                  missingCount > 0 ||
                  lightsailRegionInvalid ||
                  openPortsInvalid
                }
                className="flex-1"
              >
                {deploying
                  ? "Deploying..."
                  : lightsailRegionInvalid
                    ? "Pick a Lightsail region"
                    : openPortsInvalid
                      ? "Fix the open ports"
                      : missingCount > 0
                        ? "Fill required secrets to deploy"
                        : `Deploy to ${envType}`}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
