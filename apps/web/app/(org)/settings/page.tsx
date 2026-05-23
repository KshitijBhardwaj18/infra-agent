"use client";

import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-base font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage your workspace preferences</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-16 text-center">
        <div className="mb-3 rounded-full bg-zinc-900 p-3">
          <Settings size={20} className="text-zinc-600" />
        </div>
        <p className="text-sm font-medium text-zinc-400">Coming soon</p>
        <p className="mt-1 text-xs text-zinc-600">Workspace settings are on the way</p>
      </div>
    </div>
  );
}
