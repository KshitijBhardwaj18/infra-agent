import { createAppAuth } from "@octokit/auth-app";

interface CachedToken {
  token: string;
  expiresAt: number; // unix ms
}

const tokenCache = new Map<number, CachedToken>();

/** Refresh tokens 5 minutes before they expire (tokens are valid 1 hour). */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function parseInstallationId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `Invalid installationId "${raw}": must be a positive integer string`,
    );
  }
  return n;
}

export async function getInstallationToken(
  installationId: string,
): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
  }

  const id = parseInstallationId(installationId);
  const now = Date.now();
  const cached = tokenCache.get(id);

  if (cached && cached.expiresAt - now > REFRESH_BUFFER_MS) {
    return cached.token;
  }

  const auth = createAppAuth({
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });

  const installationAuth = await auth({
    type: "installation",
    installationId: id,
  });

  // GitHub installation tokens expire in 1 hour; expiresAt is an ISO string.
  const expiresAt = installationAuth.expiresAt
    ? new Date(installationAuth.expiresAt).getTime()
    : now + 60 * 60 * 1000;

  tokenCache.set(id, { token: installationAuth.token, expiresAt });

  return installationAuth.token;
}

export interface GithubInstallationMeta {
  id: number;
  account: { login: string; type: "User" | "Organization" } | null;
}

/**
 * Fetches metadata for a GitHub App installation using an app-level JWT.
 * Returns id and account (login + type) for the installation.
 */
export async function getInstallationMeta(
  installationId: string,
): Promise<GithubInstallationMeta> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
  }

  const auth = createAppAuth({
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });

  const appAuth = await auth({ type: "app" });

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${appAuth.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    const err = new Error(
      `Failed to fetch installation ${installationId}: HTTP ${res.status}`,
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as GithubInstallationMeta;
}

/**
 * Returns the GitHub settings URL for an existing app installation so users
 * can manage repository access without creating a duplicate install.
 */
export async function getInstallationManageUrl(
  installationId: string,
): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
  }

  const id = parseInstallationId(installationId);

  const auth = createAppAuth({
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });

  const appAuth = await auth({ type: "app" });

  const res = await fetch(`https://api.github.com/app/installations/${id}`, {
    headers: {
      Authorization: `Bearer ${appAuth.token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch installation ${id}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    account: { login: string; type: string };
    id: number;
  };

  if (data.account.type === "Organization") {
    return `https://github.com/organizations/${data.account.login}/settings/installations/${data.id}`;
  }
  return `https://github.com/settings/installations/${data.id}`;
}
