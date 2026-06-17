"use client";

import type { HeizenConfig } from "@heizen/shared";
import { isValidCidr } from "@heizen/shared";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type OpenPort = NonNullable<HeizenConfig["openPorts"]>[number];

// Always open on every box — listing one of these as an "extra" is redundant.
const BASELINE_PORTS = new Set([22, 80, 443]);

/**
 * Editor for extra firewall ports opened on the EC2/Lightsail box, beyond
 * the baked-in 22/80/443. Shown for compose targets only. Writes to
 * config.openPorts (cleared to undefined when empty).
 */
export function OpenPortsSection({
  config,
  onConfigChange,
}: {
  config: HeizenConfig;
  onConfigChange: (patch: Partial<HeizenConfig>) => void;
}) {
  const ports = config.openPorts ?? [];

  const update = (next: OpenPort[]) =>
    onConfigChange({ openPorts: next.length > 0 ? next : undefined });

  const addRow = () =>
    update([...ports, { port: 8080, protocol: "tcp", cidr: "0.0.0.0/0" }]);

  const setRow = (i: number, patch: Partial<OpenPort>) =>
    update(ports.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const removeRow = (i: number) =>
    update(ports.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-sm">Open ports</Label>
          <p className="text-xs text-muted-foreground">
            Extra firewall ports beyond the always-open 22 / 80 / 443.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addRow}
          className="shrink-0 gap-1.5 text-xs"
        >
          <Plus size={12} /> Add port
        </Button>
      </div>

      {ports.length > 0 && (
        <div className="space-y-2">
          {ports.map((p, i) => {
            const rangeBad =
              !Number.isInteger(p.port) || p.port < 1 || p.port > 65535;
            const dup = BASELINE_PORTS.has(p.port);
            const cidrBad = !!p.cidr && !isValidCidr(p.cidr);
            const wideOpen =
              !cidrBad && (p.cidr ?? "0.0.0.0/0").trim() === "0.0.0.0/0";
            return (
              <div
                key={i}
                className="rounded-md border border-border/60 bg-background p-2"
              >
                <div className="grid grid-cols-[5rem,5rem,1fr,auto] items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={Number.isFinite(p.port) ? p.port : ""}
                    onChange={(e) => {
                      // Empty / mid-edit clears to 0 (flagged below) rather
                      // than letting NaN into config state.
                      const n = Number(e.target.value);
                      setRow(i, { port: Number.isFinite(n) ? n : 0 });
                    }}
                    placeholder="Port"
                    className="h-7 text-xs"
                  />
                  <NativeSelect
                    value={p.protocol}
                    onChange={(e) =>
                      // Runtime-narrow rather than blindly casting the value.
                      setRow(i, {
                        protocol: e.target.value === "udp" ? "udp" : "tcp",
                      })
                    }
                    className="h-7 text-xs"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </NativeSelect>
                  <Input
                    value={p.cidr ?? ""}
                    onChange={(e) =>
                      setRow(i, { cidr: e.target.value || undefined })
                    }
                    placeholder="0.0.0.0/0"
                    className={cn(
                      "h-7 font-mono text-xs",
                      cidrBad && "border-destructive",
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Remove port"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Input
                  value={p.description ?? ""}
                  onChange={(e) =>
                    setRow(i, { description: e.target.value || undefined })
                  }
                  placeholder="Description (optional)"
                  className="mt-2 h-7 text-xs"
                />
                {rangeBad && (
                  <p className="mt-1 text-[11px] text-destructive">
                    Port must be a whole number between 1 and 65535.
                  </p>
                )}
                {cidrBad && (
                  <p className="mt-1 text-[11px] text-destructive">
                    Not a valid CIDR block (e.g. 0.0.0.0/0 or 10.0.0.0/8).
                  </p>
                )}
                {!rangeBad && dup && (
                  <p className="mt-1 text-[11px] text-warning-foreground">
                    {p.port} is already open by default — this row is redundant.
                  </p>
                )}
                {!rangeBad && wideOpen && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Exposed to the entire internet (0.0.0.0/0). Restrict the
                    source range if you can.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
