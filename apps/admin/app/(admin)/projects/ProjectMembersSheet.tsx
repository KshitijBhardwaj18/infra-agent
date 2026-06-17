"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { Trash2 } from "lucide-react";

interface ProjectMember {
  id: string;
  role: "OWNER" | "DEPLOYER" | "VIEWER";
  user: { id: string; name: string; email: string; image: string | null };
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

interface Props {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectMembersSheet({ projectId, projectName, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const membersKey = ["admin", "project-members", projectId] as const;
  const usersKey = ["admin", "users"] as const;

  // undefined keeps base-ui's Select in uncontrolled-initial mode until
  // a user is picked, avoiding the controlled/uncontrolled flip warning.
  const [addUserId, setAddUserId] = useState<string | undefined>(undefined);
  const [addRole, setAddRole] = useState<"OWNER" | "DEPLOYER" | "VIEWER">("VIEWER");

  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: () =>
      api<ProjectMember[]>(`/api/admin/projects/${projectId}/members`),
    enabled: open,
  });
  const usersQuery = useQuery({
    queryKey: usersKey,
    queryFn: () => api<AdminUser[]>("/api/admin/users"),
    enabled: open,
  });

  const members = membersQuery.data ?? [];
  const allUsers = usersQuery.data ?? [];
  const loading = membersQuery.isLoading || usersQuery.isLoading;

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "OWNER" | "DEPLOYER" | "VIEWER" }) =>
      api(`/api/admin/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: membersKey });
      const previous = queryClient.getQueryData<ProjectMember[]>(membersKey);
      queryClient.setQueryData<ProjectMember[]>(membersKey, (old) =>
        old?.map((m) => (m.user.id === userId ? { ...m, role } : m)),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(membersKey, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    },
    onSuccess: () => toast.success("Role updated"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/admin/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      }),
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: membersKey });
      const previous = queryClient.getQueryData<ProjectMember[]>(membersKey);
      queryClient.setQueryData<ProjectMember[]>(membersKey, (old) =>
        old?.filter((m) => m.user.id !== userId),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(membersKey, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    },
    onSuccess: () => toast.success("Member removed"),
  });

  const addMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "OWNER" | "DEPLOYER" | "VIEWER" }) =>
      api(`/api/admin/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      }),
    onSuccess: () => {
      toast.success("Member added");
      setAddUserId(undefined);
      queryClient.invalidateQueries({ queryKey: membersKey });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to add member"),
  });

  const updateRole = (userId: string, role: "OWNER" | "DEPLOYER" | "VIEWER") =>
    roleMutation.mutate({ userId, role });
  const removeMember = (userId: string) => removeMutation.mutate(userId);
  const addMember = () => {
    if (!addUserId) return;
    addMutation.mutate({ userId: addUserId, role: addRole });
  };
  const adding = addMutation.isPending;

  const memberUserIds = new Set(members.map((m) => m.user.id));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{projectName}</SheetTitle>
          <SheetDescription>Manage project members</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3 px-4">
          <div className="flex items-center gap-2">
            <Select
              value={addUserId}
              onValueChange={(v) => setAddUserId(v || undefined)}
              disabled={availableUsers.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    availableUsers.length === 0
                      ? "All users are already members"
                      : "Select user..."
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={addRole} onValueChange={(v) => setAddRole(v as "OWNER" | "DEPLOYER" | "VIEWER")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OWNER">Owner</SelectItem>
                <SelectItem value="DEPLOYER">Deployer</SelectItem>
                <SelectItem value="VIEWER">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!addUserId || adding} onClick={addMember}>
              Add
            </Button>
          </div>

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!loading && members.length === 0 && (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}

          {!loading && members.map((member) => (
            <div key={member.id} className="flex items-center gap-2 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
              </div>
              <Select
                value={member.role}
                onValueChange={(v) => updateRole(member.user.id, v as "OWNER" | "DEPLOYER" | "VIEWER")}
              >
                <SelectTrigger className="w-28 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="DEPLOYER">Deployer</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeMember(member.user.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
