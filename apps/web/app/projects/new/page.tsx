"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const project = await api<{ slug: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });
      router.push(`/projects/${project.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Back to projects
      </Link>

      <div className="mb-6 mt-6">
        <h1 className="text-base font-semibold">Create a project</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Give your project a name to get started.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="max-w-lg rounded-lg border border-border bg-card p-5"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, "")
                    .replace(/^-+|-+$/g, ""),
                );
              }}
              required
            />
            <p className="text-xs text-muted-foreground">
              heizen.app/{slug || "your-project-slug"}
            </p>
          </div>

          <Separator />

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating..." : "Create project"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </div>
  );
}
