"use client";

import type { HeizenConfig, ParsedCompose } from "@heizen/shared";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Boxes, Server } from "lucide-react";

interface Props {
  config: HeizenConfig;
  missingEnvCount: number;
  /** Parsed docker-compose.yml from indexing, when the repo has one.
   *  Surfaces service/port hints for the Lightsail routing UI. */
  compose?: ParsedCompose | null;
}

export function IndexingResults({ config, missingEnvCount, compose }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Detected services
        </p>
        <div className="mt-3 space-y-2">
          {config.services.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Server size={14} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.port && (
                  <span className="text-xs text-muted-foreground">:{s.port}</span>
                )}
                <Badge variant="outline">{s.type}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Dependencies
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {config.database.engine === "postgres" && (
            <Badge variant="secondary">PostgreSQL</Badge>
          )}
          {config.cache.engine === "redis" && <Badge variant="secondary">Redis</Badge>}
          {config.storage.enabled && <Badge variant="secondary">S3 Storage</Badge>}
          {config.database.engine === "none" &&
            config.cache.engine === "none" &&
            !config.storage.enabled && (
              <span className="text-sm text-muted-foreground">None detected</span>
            )}
        </div>
      </div>

      {compose && compose.services.length > 0 && (
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            docker-compose.yml
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Found {compose.services.length} service
            {compose.services.length === 1 ? "" : "s"} in{" "}
            <code className="font-mono text-[11px]">{compose.filePath}</code>.
            Used by the Lightsail (staging) deploy path for routing.
          </p>
          <div className="mt-3 space-y-2">
            {compose.services.map((s) => {
              const exposedPorts = s.ports.filter((p) => p.host !== null);
              const internalPorts = s.ports.filter((p) => p.host === null);
              return (
                <div
                  key={s.name}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Boxes size={14} className="text-muted-foreground" />
                      <p className="text-sm font-mono">{s.name}</p>
                      {s.hasBuild && (
                        <Badge variant="outline" className="gap-1">
                          <AlertTriangle size={11} />
                          build:
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {exposedPorts.length > 0 ? (
                        exposedPorts.map((p, i) => (
                          <Badge key={i} variant="secondary" className="font-mono text-[10px]">
                            :{p.container}
                          </Badge>
                        ))
                      ) : internalPorts.length > 0 ? (
                        <span className="text-[10px] text-muted-foreground">
                          internal
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          no ports
                        </span>
                      )}
                    </div>
                  </div>
                  {s.image && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      <code className="font-mono">{s.image}</code>
                    </p>
                  )}
                  {s.envRefs.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Reads:{" "}
                      {s.envRefs.slice(0, 6).map((ref, i) => (
                        <span key={ref}>
                          <code className="font-mono text-[10px]">${ref}</code>
                          {i < Math.min(s.envRefs.length, 6) - 1 ? ", " : ""}
                        </span>
                      ))}
                      {s.envRefs.length > 6 && (
                        <span>, +{s.envRefs.length - 6} more</span>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {missingEnvCount > 0 && (
        <p className="text-sm text-warning-foreground">
          {missingEnvCount} environment variable{missingEnvCount > 1 ? "s" : ""} need
          values before deploying.
        </p>
      )}
    </div>
  );
}
