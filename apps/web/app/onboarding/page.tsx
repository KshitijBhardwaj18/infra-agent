"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: orgName, slug: orgSlug }),
      });
      setStep(2);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <div
            className={
              step >= 1
                ? "h-1.5 flex-1 rounded-full bg-white"
                : "h-1.5 flex-1 rounded-full bg-zinc-800"
            }
          />
          <div
            className={
              step >= 2
                ? "h-1.5 flex-1 rounded-full bg-white"
                : "h-1.5 flex-1 rounded-full bg-zinc-800"
            }
          />
        </div>

        {step === 1 && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
              <Building2 size={28} className="text-zinc-300" />
            </div>
            <h1 className="text-xl font-semibold">Set up your workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your workspace is where you and your team manage projects.
            </p>

            <form onSubmit={submit} className="mt-8 text-left">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Organisation name</Label>
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                    }}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Creating..." : "Continue"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
