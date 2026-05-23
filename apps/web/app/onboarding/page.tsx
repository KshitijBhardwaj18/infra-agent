"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: orgName, slug: orgSlug }),
      });
      const project = await api<{ slug: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName, slug: projectSlug }),
      });
      router.push(`/projects/${project.slug}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 text-xl font-semibold">Welcome to Heizen</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Organization Name</Label>
            <Input
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
              }}
              required
            />
          </div>
          <div>
            <Label>Organization Slug</Label>
            <Input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} required />
          </div>
          <hr className="border-[var(--border)]" />
          <div>
            <Label>First Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                setProjectSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
              }}
              required
            />
          </div>
          <div>
            <Label>Project Slug</Label>
            <Input
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating..." : "Get Started"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
