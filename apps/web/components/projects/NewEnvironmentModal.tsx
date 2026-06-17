"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { DeployStrategy } from "@heizen/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { PROJECTS_QUERY_KEY } from "@/hooks/useProject";

const TEMPLATES: {
  value: DeployStrategy;
  label: string;
  tier: "STAGING" | "PRODUCTION";
}[] = [
  {
    value: "LIGHTSAIL",
    label: "Lightsail — single VM, docker-compose",
    tier: "STAGING",
  },
  {
    value: "EC2_COMPOSE",
    label: "EC2 — single VM, docker-compose + RDS",
    tier: "PRODUCTION",
  },
  {
    value: "ECS",
    label: "ECS — managed containers (Fargate + ALB)",
    tier: "PRODUCTION",
  },
];

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Create a custom environment: pick a name, slug (auto-derived, editable),
 * a deploy template, and a tier (defaulted from the template, overridable).
 * On success, refreshes the project cache and navigates to the new env.
 */
export function NewEnvironmentModal({
  projectId,
  projectSlug,
  onClose,
}: {
  projectId: string;
  projectSlug: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [deployStrategy, setDeployStrategy] =
    useState<DeployStrategy>("LIGHTSAIL");
  const [tier, setTier] = useState<"STAGING" | "PRODUCTION">("STAGING");
  const [tierEdited, setTierEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const reserved = effectiveSlug === "staging" || effectiveSlug === "production";
  // Name has content but slugifies to empty (e.g. "@#$") — no valid slug.
  const slugEmpty = name.trim().length > 0 && !effectiveSlug;
  // Explicit URL-safe format guard. slugify already produces this shape, so
  // this is belt-and-suspenders against any future input path.
  const slugFormatBad = !!effectiveSlug && !/^[a-z0-9][a-z0-9-]*$/.test(effectiveSlug);

  const pickTemplate = (v: DeployStrategy) => {
    setDeployStrategy(v);
    // Default the tier from the template until the user overrides it.
    if (!tierEdited) {
      setTier(TEMPLATES.find((t) => t.value === v)?.tier ?? "STAGING");
    }
  };

  const create = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (slugEmpty) {
      setError("Add at least one letter or number to the name or slug.");
      return;
    }
    if (slugFormatBad) {
      setError(
        "Slug must be lowercase letters, numbers, and hyphens (starting with a letter or number).",
      );
      return;
    }
    if (reserved) {
      setError(`"${effectiveSlug}" is reserved — choose another slug.`);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const env = await api<{ slug: string }>(
        `/api/projects/${projectId}/environments`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            slug: effectiveSlug || undefined,
            deployStrategy,
            tier,
          }),
        },
      );
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      onClose();
      router.push(`/projects/${projectSlug}/${env.slug}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create environment.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-md border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">New environment</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="QA"
              className="mt-1.5"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">Slug</Label>
            <Input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="qa"
              className="mt-1.5 font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              URL identifier — lowercase and hyphenated. Opens at{" "}
              <span className="font-mono">
                /projects/{projectSlug}/{effectiveSlug || "<slug>"}
              </span>
              .
            </p>
            {reserved && (
              <p className="mt-1 text-[11px] text-destructive">
                &quot;{effectiveSlug}&quot; is reserved for the built-in
                environments.
              </p>
            )}
            {slugEmpty && (
              <p className="mt-1 text-[11px] text-destructive">
                The name needs at least one letter or number to form a slug.
              </p>
            )}
            {slugFormatBad && (
              <p className="mt-1 text-[11px] text-destructive">
                Use only lowercase letters, numbers, and hyphens.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Template</Label>
            <NativeSelect
              value={deployStrategy}
              onChange={(e) => pickTemplate(e.target.value as DeployStrategy)}
              className="mt-1.5"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label className="text-xs">Tier</Label>
            <NativeSelect
              value={tier}
              onChange={(e) => {
                setTierEdited(true);
                setTier(e.target.value as "STAGING" | "PRODUCTION");
              }}
              className="mt-1.5"
            >
              <option value="STAGING">Staging — cheaper presets</option>
              <option value="PRODUCTION">Production — production presets</option>
            </NativeSelect>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Drives default sizing/presets, independent of the template.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void create()}
            disabled={
              creating || !name.trim() || reserved || slugEmpty || slugFormatBad
            }
            className="flex-1"
          >
            {creating ? "Creating…" : "Create environment"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
