"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HeizenConfig } from "@heizen/shared";

interface Props {
  /** Public IPv4 — Lightsail static IP or EC2 Elastic IP. */
  publicIp: string;
  provider: "EC2" | "Lightsail";
  instanceName?: string;
  /** AWS console link for the box (computed per provider by the parent). */
  consoleUrl?: string | null;
  /** Caddy host routing. May be empty — then the box serves the primary
   *  service over HTTP on the IP (no hostnames configured). */
  routing?: NonNullable<HeizenConfig["routing"]>;
}

/**
 * Endpoints card for the single-VM compose targets (EC2 + Lightsail).
 * Shows the box's public IP, a console deep-link, the DNS A-records to
 * add per hostname, and provider-appropriate connect guidance. When no
 * hostnames are configured it explains the HTTP-on-IP fallback.
 */
export function VmEndpointsCard({
  publicIp,
  provider,
  instanceName,
  consoleUrl,
  routing,
}: Props) {
  const entries = Object.entries(routing ?? {});

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Server
          </p>
          <Badge variant="outline" className="text-[10px]">
            {provider}
          </Badge>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
          <code className="flex-1 font-mono text-sm">{publicIp}</code>
          <CopyButton value={publicIp} label="Copy IP" />
          <SshButton ip={publicIp} />
        </div>
        {instanceName && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Instance
            </span>
            <code className="flex-1 font-mono text-xs">{instanceName}</code>
            <CopyButton value={instanceName} label="Copy instance name" />
            {consoleUrl && (
              <a
                href={consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-info hover:underline"
              >
                console <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {provider === "Lightsail" ? (
            <>
              SSH key is downloadable from the Lightsail console → Account →
              SSH keys. Default user is{" "}
              <code className="font-mono">ubuntu</code>.
            </>
          ) : (
            <>
              Connect via SSM Session Manager (EC2 console → the instance →
              Connect → Session Manager) — no SSH key needed. Default user
              is <code className="font-mono">ubuntu</code>.
            </>
          )}
        </p>
      </div>

      {entries.length > 0 ? (
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            DNS Records to Add
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Point each hostname&apos;s A record at the IP above. HTTPS is
            automatic — Caddy fetches a Let&apos;s Encrypt cert on the first
            request after DNS resolves.
          </p>
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Type</th>
                  <th className="px-3 py-1.5 font-medium">Name</th>
                  <th className="px-3 py-1.5 font-medium">Value</th>
                  <th className="px-3 py-1.5 font-medium">Service</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {entries.map(([service, entry]) => (
                  <tr key={service} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        A
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{entry.domain}</td>
                    <td className="px-3 py-2">{publicIp}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {service}:{entry.containerPort}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {entries.map(([service, entry]) => (
              <a
                key={service}
                href={`https://${entry.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-info hover:bg-muted/50"
              >
                {entry.domain}
                <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Access
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No hostnames configured — the primary service is served over
            HTTP on the box&apos;s IP. Add a hostname in the deploy form for
            HTTPS via Let&apos;s Encrypt.
          </p>
          <a
            href={`http://${publicIp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-info hover:bg-muted/50"
          >
            http://{publicIp}
            <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label={label}
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </Button>
  );
}

function SshButton({ ip }: { ip: string }) {
  const cmd = `ssh ubuntu@${ip}`;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      onClick={async () => {
        await navigator.clipboard.writeText(cmd);
      }}
      aria-label="Copy SSH command"
    >
      <Terminal size={12} />
    </Button>
  );
}
