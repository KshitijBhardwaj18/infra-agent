"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const org = await api<{ id: string; name: string }>("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: orgName, slug: orgSlug }),
      });

      const setActiveResult = await authClient.organization.setActive({
        organizationId: org.id,
      });
      if (setActiveResult?.error) {
        setError(
          `Workspace created but couldn't activate it: ${setActiveResult.error.message ?? "unknown error"}. Try refreshing.`,
        );
        return;
      }

      // Force full reload so the session cookie (which now has activeOrganizationId)
      // is re-read by every subsequent request. router.push would keep the stale
      // session in memory.
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Failed to create org:", err);
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-white" />
        </div>

        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-card">
            <Building2 size={28} className="text-foreground/90" />
          </div>
          <h1 className="text-xl font-semibold">Set up your workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your workspace is where you and your team manage projects.
          </p>

          <form onSubmit={submit} className="mt-8 text-left">
            <div className="rounded-lg border border-border bg-card p-5 max-w-lg mx-auto space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">Organisation name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    const sanitizedSlug = e.target.value
                      .toLowerCase()
                      .replace(/\s+/g, "-")
                      .replace(/[^a-z0-9-]/g, "")
                      .replace(/^-+|-+$/g, "");
                    setOrgSlug(sanitizedSlug);
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Slug: <code className="text-foreground">{orgSlug || "your-workspace"}</code>
                </p>
              </div>
              <Button
                type="submit"
                disabled={loading || !orgName.trim() || !orgSlug}
                className="w-full"
              >
                {loading ? "Creating..." : "Continue"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
