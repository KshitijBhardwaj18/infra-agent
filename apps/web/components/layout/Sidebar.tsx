"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar({ projectSlug }: { projectSlug?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem("heizen-sidebar-collapsed");
    if (stored) setCollapsed(stored === "true");
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("heizen-sidebar-collapsed", String(next));
  };

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(projectSlug
      ? [
          { href: `/projects/${projectSlug}`, label: "Overview" },
          { href: `/projects/${projectSlug}/staging`, label: "Staging" },
          { href: `/projects/${projectSlug}/production`, label: "Production" },
        ]
      : []),
  ];

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-[var(--border)] bg-[var(--card)] transition-all",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        {!collapsed && (
          <Link href="/dashboard" className="text-lg font-semibold">
            Heizen
          </Link>
        )}
        <button onClick={toggle} className="rounded p-1 hover:bg-zinc-800">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-zinc-800",
              pathname === link.href && "bg-zinc-800 text-white",
              collapsed && "text-center px-1",
            )}
          >
            {collapsed ? link.label[0] : link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
