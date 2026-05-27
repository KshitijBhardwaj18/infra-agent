"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  Zap,
  Home,
  Rocket,
  TestTube2,
  History,
  Settings,
  KeyRound,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";

interface SidebarProps {
  projectSlug?: string;
  projectName?: string;
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
          active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          collapsed && "justify-center",
        )}
      >
        <Icon size={14} className="shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </div>
    </Link>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 border-t border-sidebar-border" />;
  return (
    <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      {label}
    </p>
  );
}

export function Sidebar({ projectSlug, projectName }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("heizen-sidebar-collapsed");
    if (stored) setCollapsed(stored === "true");
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("heizen-sidebar-collapsed", String(next));
  };

  const user = session?.user;
  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "H";
  const isInProject = !!projectSlug;

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col bg-sidebar border-r border-sidebar-border text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-[52px]" : "w-56",
      )}
    >
      <div className="flex h-[52px] items-center justify-between border-b border-sidebar-border px-3">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent ring-1 ring-sidebar-border">
            <Zap size={13} className="text-sidebar-accent-foreground" />
          </div>
          {!collapsed && <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Heizen</span>}
        </Link>
        <button
          onClick={toggle}
          className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <SectionLabel label="Workspace" collapsed={collapsed} />
        <div className="space-y-0.5">
          <NavItem
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            collapsed={collapsed}
            active={pathname === "/dashboard"}
          />
          <NavItem
            href="/projects"
            icon={FolderGit2}
            label="Projects"
            collapsed={collapsed}
            active={pathname === "/projects" || pathname === "/projects/new"}
          />
        </div>

        {isInProject && (
          <>
            <SectionLabel label="Project" collapsed={collapsed} />

            {!collapsed && (
              <div className="mb-1 flex items-center gap-2 px-2 py-1">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-blue-500 text-[10px] font-semibold text-white">
                  {(projectName ?? projectSlug ?? "P")[0]?.toUpperCase()}
                </div>
                <span className="truncate text-xs font-medium text-sidebar-foreground/90">
                  {projectName ?? projectSlug}
                </span>
              </div>
            )}

            <div className="space-y-0.5">
              <NavItem
                href={`/projects/${projectSlug}`}
                icon={Home}
                label="Overview"
                collapsed={collapsed}
                active={pathname === `/projects/${projectSlug}`}
              />
              <NavItem
                href={`/projects/${projectSlug}/production`}
                icon={Rocket}
                label="Production"
                collapsed={collapsed}
                active={pathname.startsWith(`/projects/${projectSlug}/production`)}
              />
              <NavItem
                href={`/projects/${projectSlug}/staging`}
                icon={TestTube2}
                label="Staging"
                collapsed={collapsed}
                active={pathname.startsWith(`/projects/${projectSlug}/staging`)}
              />
              <NavItem
                href={`/projects/${projectSlug}/deployments`}
                icon={History}
                label="Deployments"
                collapsed={collapsed}
                active={pathname.startsWith(`/projects/${projectSlug}/deployments`)}
              />
              <NavItem
                href={`/projects/${projectSlug}/secrets`}
                icon={KeyRound}
                label="Secrets"
                collapsed={collapsed}
                active={pathname.startsWith(`/projects/${projectSlug}/secrets`)}
              />
              <NavItem
                href={`/projects/${projectSlug}/settings`}
                icon={Settings}
                label="Settings"
                collapsed={collapsed}
                active={pathname === `/projects/${projectSlug}/settings`}
              />
            </div>
          </>
        )}
      </div>

      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
              collapsed && "justify-center",
            )}
          >
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
              <AvatarFallback className="bg-sidebar-accent text-xs">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">{user?.name ?? "User"}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{user?.email ?? ""}</p>
                </div>
                <ChevronDown size={12} className="shrink-0 text-muted-foreground/70" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="text-sm text-destructive focus:text-destructive"
              onClick={() =>
                signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      window.location.href = "/login";
                    },
                  },
                })
              }
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
