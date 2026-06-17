"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  FolderGit2,
  GitBranch,
  ArrowLeft,
  ScrollText,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/useMe";
import { signOut } from "@/lib/auth-client";
import { HeizenMark } from "@/components/HeizenMark";

const USER_APP_URL =
  process.env.NEXT_PUBLIC_USER_APP_URL ?? "http://localhost:3000";

function AdminNavItem({
  href,
  icon: Icon,
  label,
  active,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  external?: boolean;
}) {
  // Polish vs. the old version:
  //  - Slightly softer active state (sidebar-accent surface + foreground
  //    text instead of full primary fill — reads less "selected", more
  //    "you are here").
  //  - Icon nudges from 14 → 15px so the rounded items don't feel sparse.
  //  - 'translate' subtle motion on hover so the row feels alive.
  const content = (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
        "transition-[background-color,color,transform] duration-150",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return <Link href={href}>{content}</Link>;
}

/**
 * Initial letters of "First Last" or "First Middle Last" for the avatar
 * fallback. Falls back to first two characters of the email's local
 * part when name is missing.
 */
function initials(name: string | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading } = useMe();

  useEffect(() => {
    if (!loading && (!me || me.systemRole !== "ADMIN")) {
      sessionStorage.removeItem("admin-session-valid");
    }
  }, [me, loading]);

  if (pathname.startsWith("/login")) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-48 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!me || me.systemRole !== "ADMIN") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Session expired. Sign in again to continue.
        </p>
        <Link
          href="/login"
          className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  async function handleLogout() {
    await signOut();
    window.location.href = `${USER_APP_URL}/login`;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* Brand strip — logo lockup + admin badge */}
        <div className="flex h-[60px] items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground p-1.5 shadow-sm">
            <HeizenMark className="h-full w-full" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Heizen</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Admin
            </span>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace
            </p>
            <AdminNavItem
              href="/users"
              icon={Users}
              label="Users"
              active={pathname.startsWith("/users")}
            />
            <AdminNavItem
              href="/projects"
              icon={FolderGit2}
              label="Projects"
              active={pathname.startsWith("/projects")}
            />
            <AdminNavItem
              href="/github"
              icon={GitBranch}
              label="GitHub"
              active={pathname.startsWith("/github")}
            />
          </div>

          <div className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </p>
            <AdminNavItem
              href="/audit-log"
              icon={ScrollText}
              label="Audit log"
              active={pathname.startsWith("/audit-log")}
            />
          </div>

          <div className="pt-2">
            <Separator className="mb-3" />
            <AdminNavItem
              href={USER_APP_URL}
              icon={ArrowLeft}
              label="Back to app"
              active={false}
              external
            />
          </div>
        </nav>

        {/* User pill at the bottom */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent/60"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                      {initials(me.name, me.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-medium">{me.name || "Admin"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{me.email}</p>
                  </div>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem>
                <a href={USER_APP_URL} className="flex w-full items-center gap-2">
                  <ArrowLeft size={14} />
                  Back to app
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut size={14} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-6">{children}</main>
    </div>
  );
}
