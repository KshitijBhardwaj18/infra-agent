"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  Home,
  Rocket,
  TestTube2,
  History,
  Settings,
  KeyRound,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Siren,
  Boxes,
  Plus,
} from "lucide-react";
import { HeizenMark } from "@/components/HeizenMark";
import { useProject } from "@/hooks/useProject";
import { envSlugOf, envNameOf } from "@/lib/env-display";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
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
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
          "transition-[background-color,color,transform] duration-150",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-foreground",
          collapsed && "justify-center",
        )}
      >
        <Icon size={15} className="shrink-0" />
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
  const { project } = useProject(projectSlug);
  const [collapsed, setCollapsed] = useState(false);

  // Environments shown in the nav: production tier first, then staging tier,
  // then custom envs alphabetically. Driven off the project so custom envs
  // appear automatically.
  // Sort order: production tier first, staging next, then everything else
  // (CUSTOM, or any future type) grouped at the end and ordered by name.
  const envRank = (e: { type: string }) =>
    e.type === "PRODUCTION" ? 0 : e.type === "STAGING" ? 1 : 2;
  const navEnvs = [...(project?.environments ?? [])].sort(
    (a, b) => envRank(a) - envRank(b) || envNameOf(a).localeCompare(envNameOf(b)),
  );

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
      <div className="flex h-[60px] items-center justify-between border-b border-sidebar-border px-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground p-1.5 shadow-sm">
            <HeizenMark className="h-full w-full" />
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
              {navEnvs.map((env) => (
                <NavItem
                  key={env.id}
                  href={`/projects/${projectSlug}/${envSlugOf(env)}`}
                  icon={
                    env.type === "CUSTOM"
                      ? Boxes
                      : (env.tier ?? env.type) === "PRODUCTION"
                        ? Rocket
                        : TestTube2
                  }
                  label={envNameOf(env)}
                  collapsed={collapsed}
                  active={pathname.startsWith(
                    `/projects/${projectSlug}/${envSlugOf(env)}`,
                  )}
                />
              ))}
              <NavItem
                href={`/projects/${projectSlug}?new-env=1`}
                icon={Plus}
                label="New environment"
                collapsed={collapsed}
                active={false}
              />
              <NavItem
                href={`/projects/${projectSlug}/deployments`}
                icon={History}
                label="Deployments"
                collapsed={collapsed}
                active={pathname.startsWith(`/projects/${projectSlug}/deployments`)}
              />
              <NavItem
                href={`/projects/${projectSlug}/incidents`}
                icon={Siren}
                label="Incidents"
                collapsed={collapsed}
                active={pathname.startsWith(`/projects/${projectSlug}/incidents`)}
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

        {/* Admin nav intentionally removed from the user app sidebar — admin
            lives on the admin subdomain (ADMIN_ORIGIN) and is not reachable
            via path on the user host. Bookmark admin.host directly. */}
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
