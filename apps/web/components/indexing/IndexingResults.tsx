"use client";

import type { HeizenConfig } from "@heizen/shared";
import { Button, Card, Badge } from "@/components/ui";

interface Props {
  config: HeizenConfig;
  missingEnvCount: number;
  onConfigure: () => void;
}

export function IndexingResults({ config, missingEnvCount, onConfigure }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Services Detected</h2>
        <div className="space-y-2">
          {config.services.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between rounded-md bg-zinc-900 px-4 py-3"
            >
              <div>
                <span className="font-medium">{s.name}</span>
                <Badge className="ml-2">{s.type}</Badge>
              </div>
              {s.port && (
                <span className="text-sm text-[var(--muted)]">:{s.port}</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Dependencies</h2>
        <div className="flex gap-2">
          {config.database.engine === "postgres" && <Badge>PostgreSQL</Badge>}
          {config.cache.engine === "redis" && <Badge>Redis</Badge>}
          {config.storage.enabled && <Badge>S3 Storage</Badge>}
          {config.database.engine === "none" &&
            config.cache.engine === "none" &&
            !config.storage.enabled && (
              <span className="text-sm text-[var(--muted)]">None detected</span>
            )}
        </div>
      </Card>

      {missingEnvCount > 0 && (
        <p className="text-sm text-[var(--warning)]">
          {missingEnvCount} environment variable{missingEnvCount > 1 ? "s" : ""} need values before deploying.
        </p>
      )}

      <Button onClick={onConfigure} className="w-full">
        Configure & Deploy
      </Button>
    </div>
  );
}
