"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-20 text-center">
          <div className="mb-4 rounded-full bg-zinc-900 p-4">
            <Settings size={24} className="text-zinc-500" />
          </div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Workspace settings are coming soon.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
