"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
import { CreateUserDialog } from "./CreateUserDialog";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  systemRole: "ADMIN" | "MEMBER";
  createdAt: string;
  _count: { projectMembers: number };
}

const USERS_QUERY_KEY = ["admin", "users"] as const;

export default function AdminUsersPage() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading: loading } = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: () => api<AdminUser[]>("/api/admin/users"),
    // Toasts on initial load failure happen via onError below in React
    // Query v5 you handle errors via the query's `error` field, but
    // toast lifetime tracking needs an effect — keep silent for now.
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, systemRole }: { id: string; systemRole: "ADMIN" | "MEMBER" }) =>
      api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ systemRole }),
      }),
    // Optimistic update — flip the role immediately, rollback on error.
    onMutate: async ({ id, systemRole }) => {
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const previous = queryClient.getQueryData<AdminUser[]>(USERS_QUERY_KEY);
      queryClient.setQueryData<AdminUser[]>(USERS_QUERY_KEY, (old) =>
        old?.map((u) => (u.id === id ? { ...u, systemRole } : u)),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(USERS_QUERY_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    },
    onSuccess: () => toast.success("Role updated"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/users/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const previous = queryClient.getQueryData<AdminUser[]>(USERS_QUERY_KEY);
      queryClient.setQueryData<AdminUser[]>(USERS_QUERY_KEY, (old) =>
        old?.filter((u) => u.id !== id),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(USERS_QUERY_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    },
    onSuccess: () => toast.success("User deleted"),
  });

  const changeRole = (id: string, systemRole: "ADMIN" | "MEMBER") =>
    roleMutation.mutate({ id, systemRole });
  const deleteUser = (id: string) => deleteMutation.mutate(id);
  const load = () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage user accounts and system roles"
        actions={<CreateUserDialog onCreated={load} />}
      />

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {!loading && users.length === 0 && (
        <EmptyState icon={Users} title="No users yet" />
      )}

      {!loading && users.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>System role</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <Select
                    value={user.systemRole}
                    onValueChange={(v) => changeRole(user.id, v as "ADMIN" | "MEMBER")}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Member</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{user._count.projectMembers}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm">&#8943;</Button>} />
                      <DropdownMenuContent align="end">
                        <AlertDialogTrigger className="w-full">
                          <DropdownMenuItem variant="destructive">Delete user</DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete user?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete {user.name} and all their data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => deleteUser(user.id)}
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
    </div>
  );
}
