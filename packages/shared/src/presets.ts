import type {
  CacheSize,
  DbSize,
  LightsailBundle,
  NatMode,
} from "./heizen-config";

export interface DbPreset {
  instanceClass: string;
  label: string;
  monthlyCost: number;
  /** Initial allocated EBS storage (gp3) in GB. Sized to roughly match
   *  instance RAM so we don't undersize storage on bigger boxes. */
  allocatedStorageGb: number;
}

export interface CachePreset {
  nodeType: string;
  label: string;
  monthlyCost: number;
}

export const DB_PRESETS: Record<DbSize, DbPreset> = {
  micro: { instanceClass: "db.t4g.micro", label: "2 vCPU / 1 GB", monthlyCost: 15, allocatedStorageGb: 20 },
  small: { instanceClass: "db.t4g.small", label: "2 vCPU / 2 GB", monthlyCost: 30, allocatedStorageGb: 50 },
  medium: { instanceClass: "db.t4g.medium", label: "2 vCPU / 4 GB", monthlyCost: 60, allocatedStorageGb: 100 },
  large: { instanceClass: "db.t4g.large", label: "2 vCPU / 8 GB", monthlyCost: 120, allocatedStorageGb: 200 },
};

export const CACHE_PRESETS: Record<CacheSize, CachePreset> = {
  micro: { nodeType: "cache.t4g.micro", label: "0.5 GB", monthlyCost: 13 },
  small: { nodeType: "cache.t4g.small", label: "1.5 GB", monthlyCost: 26 },
  medium: { nodeType: "cache.t4g.medium", label: "3 GB", monthlyCost: 48 },
};

export const NAT_COSTS: Record<NatMode, number> = {
  none: 0,
  single: 35,
  dual: 70,
};

export const ALB_MONTHLY_COST = 18;
export const STORAGE_MONTHLY_COST = 3;

// ── EC2 (single-VM compose target) ───────────────────────────────────────
// On-demand monthly estimates (us-east-1, 730 hrs) + a small flat EBS
// charge for the gp3 root volume. The EC2 target has no Fargate/ALB/NAT/
// ElastiCache — just the box (+ optional RDS/S3), so its cost is computed
// separately from the ECS path.
export interface Ec2InstancePreset {
  label: string;
  vcpus: number;
  ramGb: number;
  monthlyCost: number;
}
export const EC2_INSTANCE_PRESETS: Record<string, Ec2InstancePreset> = {
  "t3.small":  { label: "t3.small — 2 vCPU / 2 GB",   vcpus: 2, ramGb: 2,  monthlyCost: 15 },
  "t3.medium": { label: "t3.medium — 2 vCPU / 4 GB",  vcpus: 2, ramGb: 4,  monthlyCost: 30 },
  "t3.large":  { label: "t3.large — 2 vCPU / 8 GB",   vcpus: 2, ramGb: 8,  monthlyCost: 60 },
  "t3.xlarge": { label: "t3.xlarge — 4 vCPU / 16 GB", vcpus: 4, ramGb: 16, monthlyCost: 120 },
};
// gp3 30 GB root volume, ~$0.08/GB-mo.
export const EC2_EBS_MONTHLY_COST = 3;

// ── Lightsail bundles ────────────────────────────────────────────────────
// Bundle IDs are stable across Lightsail regions. Data transfer GB
// included in the bundle; only relevant for cost calc, not Pulumi.
export interface LightsailBundlePreset {
  bundleId: string;
  label: string;
  ramGb: number;
  vcpus: number;
  storageGb: number;
  transferTb: number;
  monthlyCost: number;
}

export const LIGHTSAIL_BUNDLE_PRESETS: Record<
  LightsailBundle,
  LightsailBundlePreset
> = {
  nano:   { bundleId: "nano_3_0",   label: "512 MB / 2 vCPU / 20 GB",  ramGb: 0.5, vcpus: 2, storageGb: 20,  transferTb: 1, monthlyCost: 5 },
  micro:  { bundleId: "micro_3_0",  label: "1 GB / 2 vCPU / 40 GB",    ramGb: 1,   vcpus: 2, storageGb: 40,  transferTb: 2, monthlyCost: 7 },
  small:  { bundleId: "small_3_0",  label: "2 GB / 2 vCPU / 60 GB",    ramGb: 2,   vcpus: 2, storageGb: 60,  transferTb: 3, monthlyCost: 12 },
  medium: { bundleId: "medium_3_0", label: "4 GB / 2 vCPU / 80 GB",    ramGb: 4,   vcpus: 2, storageGb: 80,  transferTb: 4, monthlyCost: 24 },
  large:  { bundleId: "large_3_0",  label: "8 GB / 2 vCPU / 160 GB",   ramGb: 8,   vcpus: 2, storageGb: 160, transferTb: 5, monthlyCost: 48 },
};

// Curated list of commercial AWS regions for the deploy-form region picker.
// Manually maintained (no AWS discover endpoint) — re-verify when AWS
// launches new regions. Excludes GovCloud / China / opt-in-disabled regions.
export const AWS_REGIONS: { code: string; label: string }[] = [
  { code: "us-east-1", label: "US East (N. Virginia)" },
  { code: "us-east-2", label: "US East (Ohio)" },
  { code: "us-west-1", label: "US West (N. California)" },
  { code: "us-west-2", label: "US West (Oregon)" },
  { code: "ca-central-1", label: "Canada (Central)" },
  { code: "sa-east-1", label: "South America (São Paulo)" },
  { code: "eu-west-1", label: "Europe (Ireland)" },
  { code: "eu-west-2", label: "Europe (London)" },
  { code: "eu-west-3", label: "Europe (Paris)" },
  { code: "eu-central-1", label: "Europe (Frankfurt)" },
  { code: "eu-north-1", label: "Europe (Stockholm)" },
  { code: "eu-south-1", label: "Europe (Milan)" },
  { code: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { code: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { code: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
  { code: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { code: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { code: "ap-east-1", label: "Asia Pacific (Hong Kong)" },
  { code: "me-south-1", label: "Middle East (Bahrain)" },
  { code: "af-south-1", label: "Africa (Cape Town)" },
];

/** Default region used when none is set yet (matches the historical default). */
export const DEFAULT_REGION = "us-east-1";

/** True if `region` is one of the curated commercial AWS regions above. */
export function isAwsRegion(region: string): boolean {
  return AWS_REGIONS.some((r) => r.code === region);
}

/**
 * Validates an IPv4 or IPv6 CIDR block (e.g. "10.0.0.0/8", "::/0"). Used for
 * the open-ports source ranges so a malformed block fails in the form rather
 * than silently producing a broken security-group rule at deploy time. An
 * empty string is treated as valid — callers default it to 0.0.0.0/0.
 */
export function isValidCidr(cidr: string): boolean {
  const s = cidr.trim();
  if (!s) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(s);
  if (v4) {
    const octets = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    const prefix = Number(v4[5]);
    return octets.every((o) => o >= 0 && o <= 255) && prefix >= 0 && prefix <= 32;
  }
  // Loose IPv6 CIDR: hex/colon groups + a 0–128 prefix.
  const v6 = /^[0-9a-fA-F:]+\/(\d{1,3})$/.exec(s);
  if (v6) {
    const prefix = Number(v6[1]);
    return s.includes(":") && prefix >= 0 && prefix <= 128;
  }
  return false;
}

// AWS Lightsail availability — manually curated since the SDK doesn't
// expose a discover endpoint. Re-verify if AWS launches new regions.
export const LIGHTSAIL_REGIONS = [
  "us-east-1", "us-east-2", "us-west-2",
  "ap-south-1", "ap-northeast-1", "ap-northeast-2", "ap-southeast-1", "ap-southeast-2",
  "ca-central-1", "eu-central-1", "eu-north-1", "eu-west-1", "eu-west-2", "eu-west-3",
] as const;

export type LightsailRegion = (typeof LIGHTSAIL_REGIONS)[number];

export function isLightsailRegion(region: string): region is LightsailRegion {
  return (LIGHTSAIL_REGIONS as readonly string[]).includes(region);
}

/** Rough monthly Fargate cost estimate from CPU units and memory MB. */
export function estimateFargateMonthlyCost(cpu: number, memory: number): number {
  const vcpu = cpu / 1024;
  const gb = memory / 1024;
  return Math.round(vcpu * 30 + gb * 3);
}
