"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 rounded-full bg-destructive/10 p-3 w-fit">
          <AlertTriangle size={20} className="text-destructive" />
        </div>
        <h1 className="text-base font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground/60">
            ref {error.digest}
          </p>
        )}
        <Button onClick={reset} variant="outline" size="sm" className="mt-6">
          <RotateCcw size={14} className="mr-2" />
          Try again
        </Button>
      </div>
    </div>
  );
}
