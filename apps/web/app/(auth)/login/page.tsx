"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Check } from "lucide-react";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

function LoginContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const callbackURL = `${window.location.origin}${next}`;
      const result = await signIn.social({ provider: "github", callbackURL });
      if (result.error) {
        setError(result.error.message ?? "GitHub sign-in failed. Check API env config.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Is the API running?");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    "Auto-detects your stack",
    "Deploys to AWS in minutes",
    "Monitors and alerts automatically",
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden min-h-screen flex-1 flex-col justify-between border-r border-zinc-800 bg-zinc-900 p-10 md:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800">
            <span className="text-sm font-semibold text-white">H</span>
          </div>
          <span className="text-xl font-semibold text-white">Heizen</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-white">
            Ship infrastructure,{" "}
            <span className="text-zinc-500">not YAML.</span>
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            Connect your repo. We figure out the rest.
          </p>
        </div>
        <ul className="space-y-3">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-zinc-400">
              <Check size={14} className="shrink-0 text-green-500" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-800">
              <span className="text-sm font-semibold">H</span>
            </div>
            <span className="text-lg font-semibold">Heizen</span>
          </div>

          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your workspace
          </p>

          <div className="mt-8 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <Button
              variant="outline"
              onClick={handleSignIn}
              disabled={loading}
              className="h-10 w-full gap-2 border-zinc-700 bg-zinc-800 text-sm font-medium hover:bg-zinc-700 hover:text-white"
            >
              <GitHubIcon size={15} />
              {loading ? "Redirecting…" : "Continue with GitHub"}
            </Button>
            {error && (
              <p className="text-center text-xs text-red-400">{error}</p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to our Terms of Service
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
