"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

interface HeaderProps {
  projectSlug?: string;
  projectName?: string;
  githubBranch?: string | null;
}

function Crumb({
  href,
  label,
  current,
}: {
  href?: string;
  label: string;
  current?: boolean;
}) {
  if (current || !href) {
    return <span className="text-xs text-foreground/90">{label}</span>;
  }
  return (
    <Link href={href} className="text-xs text-muted-foreground transition-colors hover:text-foreground/90">
      {label}
    </Link>
  );
}

export function Header({ projectSlug, projectName, githubBranch }: HeaderProps) {
  const pathname = usePathname();

  const crumbs: Array<{ href?: string; label: string; current?: boolean }> = [
    { href: "/dashboard", label: "Heizen" },
  ];

  if (pathname === "/dashboard") {
    crumbs.push({ label: "Dashboard", current: true });
  } else if (pathname === "/projects" || pathname === "/projects/new") {
    crumbs.push({ href: "/projects", label: "Projects", current: pathname === "/projects" });
    if (pathname === "/projects/new") {
      crumbs.push({ label: "New project", current: true });
    }
  } else if (pathname === "/settings") {
    crumbs.push({ label: "Settings", current: true });
  } else if (projectSlug) {
    crumbs.push({ href: "/projects", label: "Projects" });
    crumbs.push({
      href: `/projects/${projectSlug}`,
      label: projectName ?? projectSlug,
      current: pathname === `/projects/${projectSlug}`,
    });

    if (pathname.startsWith(`/projects/${projectSlug}/production`)) {
      crumbs.push({ label: "Production", current: true });
    } else if (pathname.startsWith(`/projects/${projectSlug}/staging`)) {
      crumbs.push({ label: "Staging", current: true });
    } else if (pathname.startsWith(`/projects/${projectSlug}/deployments`)) {
      crumbs.push({ label: "Deployments", current: true });
    } else if (pathname === `/projects/${projectSlug}/settings`) {
      crumbs.push({ label: "Settings", current: true });
    }
  }

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
      <div className="flex h-full items-center justify-between px-6">
        <nav className="flex items-center">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center">
              {index > 0 && <span className="mx-1.5 text-foreground/20">/</span>}
              <Crumb href={crumb.href} label={crumb.label} current={crumb.current} />
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          {projectSlug && githubBranch && (
            <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
              <GitBranch size={12} />
              {githubBranch}
            </span>
          )}
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
            <Bell size={15} />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
