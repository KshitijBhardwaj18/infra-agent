"use client";

import { useEffect, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { GitBranch } from "lucide-react";
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
import { api, apiUrl } from "@/lib/api";

interface GithubConnection {
  id: string;
  accountLogin: string;
  accountType: "USER" | "ORGANIZATION";
  createdAt: string;
  addedBy: { id: string; name: string; email: string } | null;
}

function GitHubPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const CONNECTIONS_KEY = ["admin", "github-connections"] as const;

  useEffect(() => {
    const status = searchParams.get("status");
    const error = searchParams.get("error");
    const account = searchParams.get("account");

    if (status === "connected" && account) {
      toast.success(`Connected ${account}`);
      router.replace("/github");
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    } else if (error === "already_connected") {
      toast.error("This GitHub account is already connected");
      router.replace("/github");
    } else if (error === "install_failed") {
      toast.error("GitHub install failed — please try again");
      router.replace("/github");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const { data: connections = [], isLoading: loading } = useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => api<GithubConnection[]>("/api/admin/github/connections"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/github/connections/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CONNECTIONS_KEY });
      const previous = queryClient.getQueryData<GithubConnection[]>(CONNECTIONS_KEY);
      queryClient.setQueryData<GithubConnection[]>(CONNECTIONS_KEY, (old) =>
        old?.filter((c) => c.id !== id),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(CONNECTIONS_KEY, ctx.previous);
      toast.error(err instanceof Error ? err.message : "Failed to remove connection");
    },
    onSuccess: () => toast.success("Connection removed"),
  });

  const removeConnection = (id: string) => removeMutation.mutate(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GitHub Connections"
        subtitle="GitHub App installations connected to this workspace"
        actions={
          <Button
            size="sm"
            onClick={() => {
              window.location.href = apiUrl("/api/admin/github/connections/install");
            }}
          >
            <GitBranch size={14} className="mr-1" />
            Add connection
          </Button>
        }
      />

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {!loading && connections.length === 0 && (
        <EmptyState
          icon={GitBranch}
          title="No GitHub connections"
          description="Connect a GitHub account or organisation to link repositories to projects"
          action={
            <Button
              size="sm"
              onClick={() => {
                window.location.href = apiUrl("/api/admin/github/connections/install");
              }}
            >
              Add connection
            </Button>
          }
        />
      )}

      {!loading && connections.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead>Connected</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.map((conn) => (
              <TableRow key={conn.id}>
                <TableCell className="font-medium font-mono text-sm">{conn.accountLogin}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                    {conn.accountType === "ORGANIZATION" ? "Org" : "User"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {conn.addedBy?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(conn.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="destructive" size="sm">Remove</Button>} />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove connection?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will disconnect {conn.accountLogin} from this workspace. Projects using this connection must be reassigned before removal.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => removeConnection(conn.id)}
                        >
                          Remove
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

export default function AdminGithubPage() {
  return (
    <Suspense fallback={<Skeleton className="h-10 w-full" />}>
      <GitHubPageInner />
    </Suspense>
  );
}
