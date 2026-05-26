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
          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
          active && "bg-zinc-800/80 text-white",
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
  if (collapsed) return <div className="my-2 border-t border-zinc-800/50" />;
  return (
    <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
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
        "flex h-screen shrink-0 flex-col border-r border-zinc-800/50 bg-zinc-950 transition-all duration-200",
        collapsed ? "w-[52px]" : "w-[216px]",
      )}
    >
      <div className="flex h-[52px] items-center justify-between border-b border-zinc-800/50 px-3">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
            <Zap size={13} className="text-white" />
          </div>
          {!collapsed && <span className="text-sm font-semibold text-white">Heizen</span>}
        </Link>
        <button
          onClick={toggle}
          className="rounded-md p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
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
                <span className="truncate text-xs font-medium text-zinc-300">
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

      <div className="border-t border-zinc-800/50 p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-zinc-800/60",
              collapsed && "justify-center",
            )}
          >
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
              <AvatarFallback className="bg-zinc-800 text-xs">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-medium text-white">{user?.name ?? "User"}</p>
                  <p className="truncate text-[10px] text-zinc-500">{user?.email ?? ""}</p>
                </div>
                <ChevronDown size={12} className="shrink-0 text-zinc-600" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="text-sm text-red-400 focus:text-red-400"
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
