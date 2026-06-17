"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

/**
 * Shared projects query key — used by the dashboard, projects list,
 * project settings, project detail, and any sub-page that needs to
 * resolve a project by slug. All callers hit the same cache so
 * navigating between them is instant.
 */
export const PROJECTS_QUERY_KEY = ["projects"] as const;

export interface ProjectEnvironment {
  id: string;
  type: string;
  // Display name, URL-safe slug, and tier (multi-environment support).
  // Nullable for envs created before these columns existed — callers fall
  // back to `type` (e.g. slug ?? type.toLowerCase()).
  name: string | null;
  slug: string | null;
  tier: "STAGING" | "PRODUCTION" | null;
  status: string;
  // Optional in the type system but always present in API responses;
  // we widen to `| null` so the callsites that null-check work.
  awsAccountId: string | null;
  awsRoleArn: string | null;
  region: string | null;
  imageUri: string | null;
  lastDeployedAt: string | null;
  heizenConfig: unknown;
  composeServicesCache: unknown;
  stackOutputs: unknown;
  deployStrategy: "ECS" | "EC2_COMPOSE" | "LIGHTSAIL" | null;
  ec2InstanceType: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  githubInstallationId: string | null;
  environments: ProjectEnvironment[];
}

/**
 * Fetches the user's projects list and returns the one matching the
 * given slug. Backed by useQuery on PROJECTS_QUERY_KEY so any
 * sibling page that already loaded this list short-circuits to cache.
 *
 * Returns { project, projects, loading, error }. `project` is null
 * when not found (don't redirect from here — let the caller decide
 * whether 404, retry, or fall through).
 */
export function useProject(slug: string | null | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api<ProjectSummary[]>("/api/projects"),
    enabled: true,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 401) return false;
      return failureCount < 2;
    },
  });

  const project =
    slug ? query.data?.find((p) => p.slug === slug) ?? null : null;

  return {
    project,
    projects: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    /** Invalidate after mutations that touch the projects list. */
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  };
}
