import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Remove leftover infra-* temp dirs from crashed deployments. */
export async function cleanStaleTempDirs(): Promise<void> {
  const tmpdir = os.tmpdir();
  const now = Date.now();

  let entries: string[];
  try {
    entries = await fs.readdir(tmpdir);
  } catch {
    return;
  }

  for (const dir of entries) {
    if (!dir.startsWith("infra-")) continue;

    const fullPath = path.join(tmpdir, dir);
    try {
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs > TWO_HOURS_MS) {
        await fs.rm(fullPath, { recursive: true, force: true });
      }
    } catch {
      // ignore missing or permission errors
    }
  }
}
