"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

function GitHubInstalledContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const installationId = searchParams.get("installation_id");
    const stateParam = searchParams.get("state");

    if (!installationId) {
      setError("Missing installation ID from GitHub.");
      return;
    }
    if (!stateParam) {
      setError("Missing state parameter from GitHub.");
      return;
    }

    (async () => {
      try {
        const result = await api<{ slug: string }>("/api/github/install-complete", {
          method: "POST",
          body: JSON.stringify({ installationId, state: stateParam }),
        });
        router.replace(`/projects/${result.slug}/staging`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to complete GitHub install";
        setError(message);
      }
    })();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-base font-semibold">GitHub install failed</h2>
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          <button
            onClick={() => router.replace("/dashboard")}
            className="mt-4 text-sm text-zinc-400 underline hover:text-zinc-200"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Completing GitHub setup...
      </div>
    </div>
  );
}

export default function GitHubInstalledPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      }
    >
      <GitHubInstalledContent />
    </Suspense>
  );
}
