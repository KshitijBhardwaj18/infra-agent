"use client";

/**
 * Legacy redirect page — no longer used by the main install flow.
 *
 * GitHub now redirects back to /api/github/callback on the API, which handles
 * the install and redirects to the project page directly. This page exists only
 * to handle any old bookmarks or in-flight requests.
 *
 * If someone does land here (e.g. old link), send them to the dashboard with
 * a hint to try connecting again.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function GitHubInstalledPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard?info=github_reconnect");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Redirecting…
      </div>
    </div>
  );
}
