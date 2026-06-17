"use client";

import { use, useMemo, useState } from "react";
import { Siren } from "lucide-react";
import { useProject } from "@/hooks/useProject";
import type { ParsedCompose } from "@heizen/shared";
import { IncidentsList } from "@/components/observability/IncidentsList";
import { LogsPanel } from "@/components/observability/LogsPanel";
import { RollbackButton } from "@/components/observability/RollbackButton";
import { SourceStatus } from "@/components/observability/SourceStatus";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ENV_LABEL: Record<string, string> = {
  STAGING: "Staging",
  PRODUCTION: "Production",
};

const STATUS_STYLES: Record<string, string> = {
  LIVE: "bg-success/15 text-success",
  FAILED: "bg-destructive/15 text-destructive",
  DEPLOYING: "bg-info/15 text-info",
};

/**
 * The incident command center: one place to watch every environment —
 * live incident list (websocket-refreshed), live log stream, and the
 * analyze actions. Environments switch via tabs on top.
 */
export default function IncidentsPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = use(params);
  const { project, loading } = useProject(projectSlug);
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});

  const envs = useMemo(
    () =>
      [...(project?.environments ?? [])].sort((a) =>
        a.type === "STAGING" ? -1 : 1,
      ),
    [project],
  );

  // Land on the env most likely to need attention: first LIVE, else first.
  const defaultEnv =
    envs.find((e) => e.status === "LIVE")?.type ?? envs[0]?.type;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project || envs.length === 0) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-lg font-semibold">Incidents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No environments yet — incidents appear once something is deployed.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-2.5">
        <Siren size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">Incidents</h1>
          <p className="text-xs text-muted-foreground">
            Live incident tracking and app logs across environments. The
            platform sweeps every live environment automatically.
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultEnv}>
        <TabsList>
          {envs.map((env) => (
            <TabsTrigger key={env.id} value={env.type}>
              {ENV_LABEL[env.type] ?? env.type}
              <span
                className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[env.status] ?? "bg-muted text-muted-foreground"}`}
              >
                {env.status.toLowerCase()}
              </span>
              {(openCounts[env.id] ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">
                  {openCounts[env.id]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {envs.map((env) => {
          const services =
            (env.composeServicesCache as ParsedCompose | null)?.services.map(
              (s) => s.name,
            ) ?? [];
          return (
            <TabsContent key={env.id} value={env.type} className="space-y-6 pt-4">
              <SourceStatus projectId={project.id} envId={env.id} />

              <IncidentsList
                projectId={project.id}
                envId={env.id}
                envStatus={env.status}
                canOperate={true}
                onOpenCountChange={(count) =>
                  setOpenCounts((prev) =>
                    prev[env.id] === count ? prev : { ...prev, [env.id]: count },
                  )
                }
              />

              {env.status === "LIVE" && (
                <RollbackButton projectId={project.id} envId={env.id} />
              )}

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-sm font-medium">Live logs</p>
                  <Badge variant="outline" className="text-[10px]">
                    auto-refresh 20s
                  </Badge>
                </div>
                {env.status === "LIVE" ? (
                  <LogsPanel
                    projectId={project.id}
                    envId={env.id}
                    services={services}
                    canOperate={true}
                    autoRefresh
                  />
                ) : (
                  <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                    Logs stream once this environment is live.
                  </p>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
