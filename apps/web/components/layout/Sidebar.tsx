"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  Settings,
  GitBranch,
  Rocket,
  TestTube2,
  KeyRound,
  Zap,
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
  envType?: string;
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
          "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
          "text-zinc-400 hover:bg-zinc-800/60 hover:text-white",
          active && "bg-zinc-800 text-white",
          collapsed && "justify-center px-2",
        )}
      >
        <Icon size={15} className="shrink-0" />
        {!collapsed && <span>{label}</span>}
      </div>
    </Link>
  );
}

export function Sidebar({ projectSlug, envType }: SidebarProps) {
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
  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "H";

  const workspaceNav = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/dashboard", icon: FolderGit2, label: "Projects" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const projectNav = projectSlug
    ? [
        { href: `/projects/${projectSlug}`, icon: GitBranch, label: "Overview" },
        { href: `/projects/${projectSlug}/production`, icon: Rocket, label: "Production" },
        { href: `/projects/${projectSlug}/staging`, icon: TestTube2, label: "Staging" },
        {
          href: `/projects/${projectSlug}/${envType ?? "production"}/env-vars`,
          icon: KeyRound,
          label: "Env Vars",
        },
      ]
    : [];

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-zinc-800/50 bg-zinc-950 transition-all duration-200",
        collapsed ? "w-[52px]" : "w-[220px]",
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-zinc-800/50 px-3">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900">
            <Zap size={14} className="text-white" />
          </div>
          {!collapsed && <span className="text-sm font-semibold text-white">Heizen</span>}
        </Link>
        {!collapsed && (
          <button
            onClick={toggle}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggle}
          className="mx-auto mt-2 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <PanelLeft size={15} />
        </button>
      )}

      <div className="mt-2 flex-1 overflow-y-auto px-2">
        {!collapsed && (
          <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Workspace
          </p>
        )}
        <div className="space-y-0.5">
          {workspaceNav.map((item) => (
            <NavItem
              key={item.label}
              href={item.href}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
              active={pathname === item.href || (item.label === "Projects" && pathname.startsWith("/projects"))}
            />
          ))}
        </div>

        {projectNav.length > 0 && (
          <>
            {!collapsed && (
              <p className="mb-1 mt-5 px-2 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                Project
              </p>
            )}
            <div className="mt-1 space-y-0.5">
              {projectNav.map((item) => (
                <NavItem
                  key={item.label}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  collapsed={collapsed}
                  active={pathname === item.href || pathname.startsWith(item.href + "/")}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-auto border-t border-zinc-800/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-zinc-800/60",
              collapsed && "justify-center",
            )}
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
              <AvatarFallback className="bg-zinc-800 text-xs">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-white">{user?.name ?? "User"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </div>
                <ChevronDown size={14} className="text-zinc-500" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
