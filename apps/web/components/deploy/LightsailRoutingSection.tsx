"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Globe } from "lucide-react";
import type {
  HeizenConfig,
  LightsailBundle,
  ParsedCompose,
} from "@heizen/shared";
import { LIGHTSAIL_BUNDLE_PRESETS } from "@heizen/shared";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

const FQDN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i;

interface Props {
  config: HeizenConfig;
  /** Parsed compose from indexing. When null, we render an empty
   *  state that prompts the user to re-index or add a compose file. */
  compose: ParsedCompose | null;
  onConfigChange: (patch: Partial<HeizenConfig>) => void;
}

/**
 * Lightsail deploy form variant — replaces the ECS service-cards UI.
 * The user picks an instance bundle and assigns a public hostname to
 * each compose service they want exposed. Internal services (no host
 * port) appear but can't be toggled on.
 */
export function LightsailRoutingSection({
  config,
  compose,
  onConfigChange,
}: Props) {
  const bundle: LightsailBundle = config.lightsailBundle ?? "small";

  if (!compose) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-warning-foreground" />
          <p className="text-sm font-medium">
            No docker-compose.yml detected
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The Lightsail (staging) template needs a docker-compose.yml at
          the root of your repo. Add one and re-index, or pick the
          production env for a Pulumi-managed AWS stack.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Lightsail bundle</Label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Single-VM size. RAM is the only knob that matters in practice —
          Docker, Caddy, postgres, redis, and your services share it.
        </p>
        <NativeSelect
          value={bundle}
          onChange={(e) =>
            onConfigChange({ lightsailBundle: e.target.value as LightsailBundle })
          }
          className="mt-1.5 max-w-xs"
        >
          {(Object.entries(LIGHTSAIL_BUNDLE_PRESETS) as Array<
            [LightsailBundle, (typeof LIGHTSAIL_BUNDLE_PRESETS)[LightsailBundle]]
          >).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label} — ${preset.monthlyCost}/mo
            </option>
          ))}
        </NativeSelect>
      </div>

      <RoutingTable
        compose={compose}
        config={config}
        onConfigChange={onConfigChange}
      />

      <div>
        <Label className="text-xs">
          Caddy / Let&apos;s Encrypt email{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Where Let&apos;s Encrypt sends cert-renewal notices. Leave blank
          to use the platform default.
        </p>
        <Input
          type="email"
          value={config.caddyEmail ?? ""}
          onChange={(e) =>
            onConfigChange({ caddyEmail: e.target.value.trim() || undefined })
          }
          placeholder="you@yourdomain.com"
          className="mt-1.5 h-8 max-w-xs text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <CaddyfilePreview
        compose={compose}
        routing={config.routing ?? {}}
        caddyEmail={config.caddyEmail}
      />
    </div>
  );
}

function RoutingTable({
  compose,
  config,
  onConfigChange,
}: Pick<Props, "compose" | "config" | "onConfigChange"> & {
  compose: ParsedCompose;
}) {
  const routing = config.routing ?? {};

  const toggleService = (serviceName: string) => {
    const next = { ...routing };
    if (next[serviceName]) {
      delete next[serviceName];
    } else {
      const svc = compose.services.find((s) => s.name === serviceName)!;
      const exposed = svc.ports.find((p) => p.host !== null) ?? svc.ports[0];
      next[serviceName] = {
        domain: "",
        containerPort: exposed?.container ?? 80,
      };
    }
    onConfigChange({ routing: next });
  };

  const updateEntry = (
    serviceName: string,
    patch: Partial<{ domain: string; containerPort: number }>,
  ) => {
    const cur = routing[serviceName];
    if (!cur) return;
    onConfigChange({
      routing: { ...routing, [serviceName]: { ...cur, ...patch } },
    });
  };

  return (
    <div>
      <Label className="text-xs">Public routing</Label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Caddy will reverse-proxy requests to the compose service based on
        the Host: header. Each domain gets free Let&apos;s Encrypt HTTPS.
      </p>

      <div className="mt-2 space-y-2">
        {compose.services.map((svc) => {
          const entry = routing[svc.name];
          const isExposed = !!entry;
          const exposablePorts = svc.ports.map((p) => p.container);
          const canExpose = exposablePorts.length > 0;

          return (
            <div
              key={svc.name}
              className={cn(
                "rounded-lg border bg-card/50 p-3",
                isExposed ? "border-primary/40" : "border-border",
                !canExpose && "opacity-60",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Boxes size={14} className="text-muted-foreground" />
                  <span className="text-sm font-mono">{svc.name}</span>
                  {svc.hasBuild && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <AlertTriangle size={10} />
                      build:
                    </Badge>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={isExposed}
                    onChange={() => toggleService(svc.name)}
                    disabled={!canExpose}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-muted-foreground">
                    {canExpose ? "Expose publicly" : "no exposable ports"}
                  </span>
                </label>
              </div>

              {isExposed && entry && (
                <div className="mt-3 grid grid-cols-[1fr,auto] gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Hostname
                    </p>
                    <Input
                      value={entry.domain}
                      onChange={(e) =>
                        updateEntry(svc.name, { domain: e.target.value.trim() })
                      }
                      placeholder={`${svc.name}.example.com`}
                      className={cn(
                        "h-7 text-xs font-mono",
                        entry.domain &&
                          !FQDN_RE.test(entry.domain) &&
                          "border-destructive",
                      )}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Port
                    </p>
                    <NativeSelect
                      value={entry.containerPort}
                      onChange={(e) =>
                        updateEntry(svc.name, {
                          containerPort: Number(e.target.value),
                        })
                      }
                      className="h-7 font-mono"
                    >
                      {exposablePorts.map((port) => (
                        <option key={port} value={port}>
                          :{port}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaddyfilePreview({
  compose,
  routing,
  caddyEmail,
}: {
  compose: ParsedCompose;
  routing: NonNullable<HeizenConfig["routing"]>;
  caddyEmail?: string;
}) {
  const entries = useMemo(
    () => Object.entries(routing),
    [routing],
  );
  if (entries.length === 0) return null;

  // Mirror the worker's lookup order so the preview matches what'll
  // actually get written onto the box at deploy time.
  const resolvedEmail = caddyEmail?.trim() || "admin@heizen.tech";

  return (
    <div>
      <Label className="text-xs">Generated Caddyfile preview</Label>
      <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-card/50 p-3 font-mono text-[11px] leading-relaxed">
        <code>
          {`{\n  email ${resolvedEmail}\n}\n\n`}
          {entries.map(([serviceName, e]) => (
            <span key={serviceName}>
              {`${e.domain || "<set hostname>"} {\n`}
              {`  reverse_proxy ${serviceName}:${e.containerPort}\n`}
              {`}\n\n`}
            </span>
          ))}
        </code>
      </pre>
      <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
        <p className="flex items-start gap-2">
          <Globe size={11} className="mt-0.5 shrink-0" />
          <span>
            After deploy, point each hostname&apos;s DNS A record at the
            Lightsail static IP (shown on the env page).
          </span>
        </p>
        <p className="pl-[18px]">
          The{" "}
          <code className="font-mono">email</code> in the global block is
          used by Let&apos;s Encrypt for cert renewal notifications. Set
          a custom address via <code className="font-mono">caddyEmail</code>{" "}
          in your heizenConfig if you want it to be something other than
          the platform default.
        </p>
      </div>
    </div>
  );
}
