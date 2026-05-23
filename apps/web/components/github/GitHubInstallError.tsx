"use client";

import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  github_install_failed: "GitHub App installation failed.",
  github_install_missing: "GitHub did not return an installation ID.",
  github_state_invalid: "GitHub install state was invalid or expired.",
};

export function GitHubInstallError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const reason = searchParams.get("reason");

  if (!error || !(error in ERROR_MESSAGES)) return null;

  return (
    <div className="mb-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {ERROR_MESSAGES[error]}
      {reason && ` Reason: ${reason}`}
    </div>
  );
}
