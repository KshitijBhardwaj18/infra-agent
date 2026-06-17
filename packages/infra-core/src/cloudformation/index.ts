import * as fs from "fs/promises";
import * as path from "path";

// Resolves relative to this compiled module. The build script copies the
// .yml files under src/cloudformation/ to dist/cloudformation/, so at
// runtime __dirname is dist/cloudformation/ — the same mechanism the
// template renderer uses for dist/templates. This keeps asset resolution
// owned by infra-core (which knows where its own files live) instead of
// callers guessing relative paths into this package's source tree.
const CFN_ROOT = __dirname;

export const DEPLOY_ROLE_TEMPLATE_FILE = "heizen-deploy-role.yml";

/**
 * Reads the Heizen deploy-role CloudFormation template bundled with this
 * package. Throws a clear, path-qualified error if the asset is missing
 * (e.g. the build copy step didn't run) rather than failing silently.
 */
export async function readDeployRoleTemplate(): Promise<string> {
  const file = path.join(CFN_ROOT, DEPLOY_ROLE_TEMPLATE_FILE);
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Heizen deploy-role CloudFormation template not found at ${file}: ${msg}`,
    );
  }
}
