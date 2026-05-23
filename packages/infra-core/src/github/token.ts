import { createAppAuth } from "@octokit/auth-app";

export async function getInstallationToken(
  installationId: string,
): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
  }

  const auth = createAppAuth({
    appId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });

  const installationAuth = await auth({
    type: "installation",
    installationId: Number(installationId),
  });

  return installationAuth.token;
}
