"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const project = await api<{ slug: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      router.push(`/projects/${project.slug}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-lg p-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to projects
        </Link>

        <h1 className="mt-6 text-xl font-semibold">Create a project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give your project a name to get started.
        </p>

        <form
          onSubmit={submit}
          className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        >
          <div>
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
              }}
              required
              className="mt-1.5"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              heizen.app/{slug || "your-project-slug"}
            </p>
          </div>

          <Separator className="my-6" />

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating..." : "Create project"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
