"use client";

import {
  Server,
  Database,
  HardDrive,
  Network,
  Shield,
  Activity,
  Box,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { resourceConsoleUrl } from "@/lib/aws-console";

interface StackResource {
  id: string;
  pulumiUrn: string;
  type: string;
  name: string;
  dependencies: string[];
  properties?: { id?: string } | null;
}

type Category =
  | "Compute"
  | "Database"
  | "Storage"
  | "Networking"
  | "Security"
  | "Observability"
  | "Other";

const CATEGORY_ORDER: Category[] = [
  "Compute",
  "Database",
  "Storage",
  "Networking",
  "Security",
  "Observability",
  "Other",
];

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  Compute: Server,
  Database: Database,
  Storage: HardDrive,
  Networking: Network,
  Security: Shield,
  Observability: Activity,
  Other: Box,
};

function categorize(type: string): Category {
  const lower = type.toLowerCase();

  if (
    lower.includes("ecs/") ||
    lower.includes("lambda/") ||
    lower.includes("ec2/instance") ||
    lower.includes("apprunner/")
  ) {
    return "Compute";
  }
  if (
    lower.includes("rds/") ||
    lower.includes("dynamodb/") ||
    lower.includes("elasticache/") ||
    lower.includes("documentdb/")
  ) {
    return "Database";
  }
  if (lower.includes("s3/") || lower.includes("efs/") || lower.includes("ecr/")) {
    return "Storage";
  }
  if (
    lower.includes("ec2/vpc") ||
    lower.includes("ec2/subnet") ||
    lower.includes("ec2/internetgateway") ||
    lower.includes("ec2/natgateway") ||
    lower.includes("ec2/routetable") ||
    lower.includes("ec2/route") ||
    lower.includes("ec2/eip") ||
    lower.includes("lb/") ||
    lower.includes("route53/") ||
    lower.includes("apigateway/") ||
    lower.includes("cloudfront/")
  ) {
    return "Networking";
  }
  if (
    lower.includes("ec2/securitygroup") ||
    lower.includes("iam/") ||
    lower.includes("kms/") ||
    lower.includes("secretsmanager/") ||
    lower.includes("acm/")
  ) {
    return "Security";
  }
  if (
    lower.includes("cloudwatch/") ||
    lower.includes("logs/") ||
    lower.includes("sns/")
  ) {
    return "Observability";
  }
  return "Other";
}

function isPulumiMeta(type: string): boolean {
  const lower = type.toLowerCase();
  return (
    lower.startsWith("pulumi:pulumi:stack") ||
    lower.startsWith("pulumi:providers:") ||
    lower.includes("pulumi:")
  );
}

function shortType(type: string): string {
  const parts = type.split(":");
  const tail = parts[parts.length - 1] ?? type;
  const spaced = tail.replace(/([a-z])([A-Z])/g, "$1 $2");
  const service = parts[1]?.split("/")[0]?.toUpperCase() ?? "";
  if (service && !spaced.toLowerCase().startsWith(service.toLowerCase())) {
    return `${service} ${spaced}`;
  }
  return spaced;
}

function ResourceCard({
  resource,
  region,
}: {
  resource: StackResource;
  region?: string;
}) {
  const category = categorize(resource.type);
  const Icon = CATEGORY_ICONS[category];
  const consoleUrl = resourceConsoleUrl(
    resource.type,
    resource.properties?.id,
    region,
  );

  const inner = (
    <>
      <div className="mt-0.5 rounded-md bg-muted p-1.5">
        <Icon size={14} className="text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{resource.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {shortType(resource.type)}
        </p>
      </div>
      {consoleUrl && (
        <ExternalLink
          size={13}
          className="mt-0.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
        />
      )}
    </>
  );

  const className =
    "group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20";

  if (consoleUrl) {
    return (
      <a
        href={consoleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title="Open in AWS console"
      >
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}

function CategorySection({
  category,
  items,
  region,
}: {
  category: Category;
  items: StackResource[];
  region?: string;
}) {
  const Icon = CATEGORY_ICONS[category];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">
          {category}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {items.length}
        </span>
        <div className="flex-1 border-t border-border/50" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} region={region} />
        ))}
      </div>
    </div>
  );
}

export function ResourceGraph({
  resources,
  region,
}: {
  resources: StackResource[];
  region?: string;
}) {
  const filtered = resources.filter((r) => !isPulumiMeta(r.type));

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
        <Box size={20} className="text-muted-foreground/70" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">No resources yet</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Deploy this environment to see your infrastructure
        </p>
      </div>
    );
  }

  const grouped = new Map<Category, StackResource[]>();
  for (const resource of filtered) {
    const cat = categorize(resource.type);
    const bucket = grouped.get(cat) ?? [];
    bucket.push(resource);
    grouped.set(cat, bucket);
  }

  const sections = CATEGORY_ORDER.filter((cat) => grouped.has(cat));

  return (
    <div className="space-y-6">
      {sections.map((category) => (
        <CategorySection
          key={category}
          category={category}
          items={grouped.get(category)!}
          region={region}
        />
      ))}
    </div>
  );
}
