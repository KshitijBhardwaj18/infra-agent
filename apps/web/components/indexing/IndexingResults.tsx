"use client";

import type { HeizenConfig } from "@heizen/shared";
import { Badge } from "@/components/ui/badge";
import { Server } from "lucide-react";

interface Props {
  config: HeizenConfig;
  missingEnvCount: number;
}

export function IndexingResults({ config, missingEnvCount }: Props) {
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

      {missingEnvCount > 0 && (
        <p className="text-sm text-warning-foreground">
          {missingEnvCount} environment variable{missingEnvCount > 1 ? "s" : ""} need
          values before deploying.
        </p>
      )}
    </div>
  );
}
