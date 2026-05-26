"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1]?.trim() ?? null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

function GitHubInstalledContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const installationId = searchParams.get("installation_id");

    if (!installationId) {
      setError("Missing installation_id from GitHub.");
      return;
    }

    const projectId = readCookie("heizen_pending_project");
    const returnEnv = readCookie("heizen_pending_env") ?? "staging";

    if (!projectId) {
      setError("Session expired. Go back and try connecting again.");
      return;
    }

    (async () => {
      try {
        const result = await api<{ slug: string; returnEnv?: string }>(
          "/api/github/install-complete",
          {
            method: "POST",
            body: JSON.stringify({ installationId, projectId, returnEnv }),
          },
        );
        clearCookie("heizen_pending_project");
        clearCookie("heizen_pending_env");
        router.replace(`/projects/${result.slug}/${result.returnEnv ?? "staging"}`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to complete GitHub setup";
        if (message.includes("401")) {
          const next = encodeURIComponent(
            `/github/installed?${searchParams.toString()}`,
          );
          router.replace(`/login?next=${next}`);
          return;
        }
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
