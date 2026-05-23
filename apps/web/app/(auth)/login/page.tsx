"use client";

import { Check } from "lucide-react";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const handleSignIn = async () => {
    await signIn.social({ provider: "github", callbackURL: "/dashboard" });
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
            Ship infrastructure, not YAML.
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            Connect your repo. We figure out the rest.
          </p>
        </div>

        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-zinc-400">
              <Check size={14} className="text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace</p>

          <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <Button variant="outline" onClick={handleSignIn} className="h-9 w-full">
              <GitHubIcon size={15} className="mr-2" />
              Continue with GitHub
            </Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              By continuing you agree to our Terms of Service
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
