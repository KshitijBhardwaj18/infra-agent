"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { ProjectMembersSheet } from "./ProjectMembersSheet";

interface AdminProject {
  id: string;
  name: string;
  slug: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubInstallationId: string | null;
  createdAt: string;
  _count: { members: number; environments: number };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const PROJECTS_QUERY_KEY = ["admin", "projects"] as const;

export default function AdminProjectsPage() {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<AdminProject | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api<AdminProject[]>("/api/admin/projects"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/projects/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY });
      const previous = queryClient.getQueryData<AdminProject[]>(PROJECTS_QUERY_KEY);
      queryClient.setQueryData<AdminProject[]>(PROJECTS_QUERY_KEY, (old) =>
        old?.filter((p) => p.id !== id),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(PROJECTS_QUERY_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    },
    onSuccess: () => toast.success("Project deleted"),
  });

  const createMutation = useMutation({
    mutationFn: ({ name, slug }: { name: string; slug: string }) =>
      api<AdminProject>("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      }),
    onSuccess: (_, { name }) => {
      toast.success(`Created ${name}`);
      setCreateOpen(false);
      setCreateName("");
      setCreateSlug("");
      setSlugManuallyEdited(false);
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to create project"),
  });

  const deleteProject = (id: string) => deleteMutation.mutate(id);
  const createProject = () => {
    const name = createName.trim();
    const slug = createSlug.trim();
    if (!name || !slug) return;
    createMutation.mutate({ name, slug });
  };
  const creating = createMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Manage all projects across the organisation"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" />
            New project
          </Button>
        }
      />

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <EmptyState
          icon={FolderGit2}
          title="No projects yet"
          description="Create one to scaffold its staging + production environments."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1" />
              New project
            </Button>
          }
        />
      )}

      {!loading && projects.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Environments</TableHead>
              <TableHead>GitHub repo</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow
                key={project.id}
                className="cursor-pointer"
                onClick={() => setSelectedProject(project)}
              >
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{project.slug}</TableCell>
                <TableCell>{project._count.members}</TableCell>
                <TableCell>{project._count.environments}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {project.githubOwner && project.githubRepo
                    ? `${project.githubOwner}/${project.githubRepo}`
                    : "—"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm">&#8943;</Button>} />
                      <DropdownMenuContent align="end">
                        <AlertDialogTrigger className="w-full">
                          <DropdownMenuItem variant="destructive">Delete project</DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete project?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete {project.name} and all its environments, deployments, and secrets. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => deleteProject(project.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selectedProject && (
        <ProjectMembersSheet
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          open={!!selectedProject}
          onOpenChange={(o) => { if (!o) setSelectedProject(null); }}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Creates a project in the default organisation. Staging and
              production environments are auto-scaffolded; connect a GitHub
              repo from the user app to start deploying.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                value={createName}
                onChange={(e) => {
                  setCreateName(e.target.value);
                  if (!slugManuallyEdited) {
                    setCreateSlug(slugify(e.target.value));
                  }
                }}
                placeholder="My Web App"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-slug">Slug</Label>
              <Input
                id="proj-slug"
                value={createSlug}
                onChange={(e) => {
                  setCreateSlug(e.target.value);
                  setSlugManuallyEdited(true);
                }}
                placeholder="my-web-app"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens. 2–40 characters.
                Used in URLs and AWS resource prefixes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={createProject}
              disabled={creating || !createName.trim() || !createSlug.trim()}
            >
              {creating ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
