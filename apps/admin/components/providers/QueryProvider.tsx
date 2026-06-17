"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * React-Query provider. Defaults mirror dev-tools' setup:
 *  - 5 min staleTime so navigating back to a recently-viewed page
 *    doesn't refetch
 *  - 10 min gcTime so cached data survives short detours
 *  - refetchOnWindowFocus: false — too noisy for an internal tool;
 *    refetch is opt-in via invalidateQueries after mutations.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
