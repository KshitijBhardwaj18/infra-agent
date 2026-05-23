"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    return <span className="text-xs text-zinc-300">{label}</span>;
  }
  return (
    <Link href={href} className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
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
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-zinc-800/50 bg-background px-6">
      <nav className="flex items-center">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex items-center">
            {index > 0 && <span className="mx-1.5 text-zinc-700">/</span>}
            <Crumb href={crumb.href} label={crumb.label} current={crumb.current} />
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {projectSlug && githubBranch && (
          <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400">
            <GitBranch size={12} />
            {githubBranch}
          </span>
        )}
        <Button variant="ghost" size="icon-sm" className="text-zinc-500 hover:text-zinc-300">
          <Bell size={15} />
        </Button>
      </div>
    </header>
  );
}
