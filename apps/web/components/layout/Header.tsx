"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HeaderProps {
  projectSlug?: string;
  projectName?: string;
  envLabel?: string;
  githubBranch?: string | null;
}

function BreadcrumbItem({
  href,
  label,
  active,
}: {
  href?: string;
  label: string;
  active?: boolean;
}) {
  if (active || !href) {
    return <span className={cn("text-sm", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>;
  }
  return (
    <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
      {label}
    </Link>
  );
}

export function Header({ projectSlug, projectName, envLabel, githubBranch }: HeaderProps) {
  const pathname = usePathname();

  const segments: Array<{ href?: string; label: string; active?: boolean }> = [
    { href: "/dashboard", label: "Dashboard" },
  ];

  if (projectSlug) {
    segments.push({
      href: `/projects/${projectSlug}`,
      label: projectName ?? projectSlug,
      active: pathname === `/projects/${projectSlug}`,
    });
  }

  if (envLabel) {
    segments.push({ label: envLabel, active: true });
  } else if (pathname === "/projects/new") {
    segments.push({ label: "New project", active: true });
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/50 px-6">
      <nav className="flex items-center gap-2">
        {segments.map((segment, index) => (
          <span key={`${segment.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <span className="text-sm text-zinc-600">/</span>}
            <BreadcrumbItem href={segment.href} label={segment.label} active={segment.active} />
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {githubBranch && (
          <Badge variant="outline" className="gap-1.5 font-normal">
            <GitBranch size={12} />
            {githubBranch}
          </Badge>
        )}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
          <Bell size={15} />
        </Button>
      </div>
    </header>
  );
}
