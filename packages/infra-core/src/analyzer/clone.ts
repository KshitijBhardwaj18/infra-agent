import simpleGit from "simple-git";
import * as fs from "fs/promises";

export async function shallowClone(
  repoUrl: string,
  token: string,
  branch: string,
  dest: string,
): Promise<void> {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });

  const authUrl = repoUrl.replace(
    "https://github.com/",
    `https://x-access-token:${token}@github.com/`,
  );

  const git = simpleGit();
  await git.clone(authUrl, dest, ["--depth", "1", "--single-branch", "--branch", branch]);
}
