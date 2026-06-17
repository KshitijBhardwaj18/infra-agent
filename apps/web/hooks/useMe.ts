"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Me {
  id: string;
  name: string;
  email: string;
  image: string | null;
  systemRole: "ADMIN" | "MEMBER";
  projectMemberships: Array<{
    projectId: string;
    role: "OWNER" | "DEPLOYER" | "VIEWER";
    slug: string;
    name: string;
  }>;
}

export const ME_QUERY_KEY = ["me"] as const;

/**
 * Returns the currently signed-in user. Backed by React Query so:
 *  - Multiple components consume this without re-fetching (the
 *    AdminShell, the env page, dropdowns — they all called it
 *    independently before).
 *  - Page navigations hit cache, not network — kills the flicker
 *    that came from each page re-fetching `me` on mount.
 *  - `invalidateQueries({ queryKey: ME_QUERY_KEY })` re-fetches after
 *    profile edits / role changes elsewhere.
 *
 * Public shape preserved (`{ me, loading, error }`) so existing
 * call sites work without changes.
 */
export function useMe() {
  const { data, isLoading, error } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api<Me>("/api/me"),
    staleTime: 5 * 60 * 1000,
  });
  return {
    me: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error : null,
  };
}
