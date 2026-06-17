import * as pulumi from "@pulumi/pulumi/automation";
import { randomBytes } from "crypto";
import type { AwsCredentials } from "./aws-role";

export interface PulumiUpOptions {
  workDir: string;
  stackName: string;
  backendBucket: string;
  passphrase: string;
  awsCreds: AwsCredentials;
  configSecrets: Record<string, string>;
  /** When true, preserves existing dbPassword from stack config or generates once on first deploy. */
  needsDbPassword?: boolean;
  onOutput?: (line: string) => void;
}

export interface PulumiUpResult {
  outputs: Record<string, unknown>;
}

function workspaceEnvVars(
  awsCreds: AwsCredentials,
  backendBucket: string,
  passphrase: string,
): Record<string, string> {
  // A blank region would make the AWS provider silently fall back to its
  // default chain and deploy to the wrong place — fail loudly instead.
  if (!awsCreds.region || !awsCreds.region.trim()) {
    throw new Error("AWS region is required to run Pulumi (got an empty value)");
  }
  return {
    AWS_ACCESS_KEY_ID: awsCreds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: awsCreds.secretAccessKey,
    AWS_SESSION_TOKEN: awsCreds.sessionToken,
    AWS_DEFAULT_REGION: awsCreds.region,
    PULUMI_BACKEND_URL: `s3://${backendBucket}`,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
  };
}

export async function runPulumiUp(
  options: PulumiUpOptions,
): Promise<PulumiUpResult> {
  const {
    workDir,
    stackName,
    backendBucket,
    passphrase,
    awsCreds,
    configSecrets,
    needsDbPassword,
    onOutput,
  } = options;

  const envVars = workspaceEnvVars(awsCreds, backendBucket, passphrase);

  const stack = await pulumi.LocalWorkspace.createOrSelectStack(
    { stackName, workDir },
    { envVars },
  );

  const secrets = { ...configSecrets };

  if (needsDbPassword) {
    let dbPassword: string | undefined;
    try {
      const existing = await stack.getConfig("dbPassword");
      dbPassword = existing.value;
    } catch {
      // not set yet on first deploy
    }
    secrets.dbPassword = dbPassword ?? randomBytes(16).toString("hex");
  }

  for (const [key, value] of Object.entries(secrets)) {
    await stack.setConfig(key, { value, secret: true });
  }

  // Clear any stale lock from a previous worker that died mid-`up`.
  // Safe because deployments.service.ts already rejects concurrent
  // deploys for the same env at the API boundary, so any lock left on
  // the stack here must be orphaned. Without this, a crashed worker
  // permanently bricks the env until someone hand-deletes the S3 lock.
  try {
    await stack.cancel();
  } catch (err) {
    onOutput?.(`[lock] cancel() failed (likely no lock): ${(err as Error).message}\n`);
  }

  const upResult = await stack.up({
    onOutput: onOutput ?? (() => {}),
  });

  return { outputs: upResult.outputs as Record<string, unknown> };
}

export interface PulumiDestroyOptions {
  workDir: string;
  stackName: string;
  backendBucket: string;
  passphrase: string;
  awsCreds: AwsCredentials;
  /** Same config secrets used at deploy time. Pulumi needs them to
   *  decrypt the prior state and re-resolve any `cfg.X` references in
   *  the program before tearing it down. */
  configSecrets: Record<string, string>;
  /** Whether to also remove the empty stack from the backend after a
   *  successful destroy. Defaults to true — we don't keep dead stacks. */
  removeStack?: boolean;
  onOutput?: (line: string) => void;
}

/**
 * Tears down all resources in a Pulumi stack via the Automation API.
 *
 * Mirrors runPulumiUp's setup (same workspace, same env vars, same
 * config) but calls stack.destroy() instead of stack.up(). After a
 * clean destroy we also drop the stack itself from the backend so the
 * next `pulumi up` against the same prefix starts fresh — not
 * resurrected-from-half-empty-state.
 */
export async function runPulumiDestroy(
  options: PulumiDestroyOptions,
): Promise<void> {
  const {
    workDir,
    stackName,
    backendBucket,
    passphrase,
    awsCreds,
    configSecrets,
    removeStack = true,
    onOutput,
  } = options;

  const envVars = workspaceEnvVars(awsCreds, backendBucket, passphrase);

  const stack = await pulumi.LocalWorkspace.selectStack(
    { stackName, workDir },
    { envVars },
  );

  // Set the same secrets used during `up` so the destroy program can
  // re-evaluate (e.g. cfg.dbPassword references in the generated
  // index.ts). Without these Pulumi raises "missing required
  // configuration variable" before destroy even starts.
  for (const [key, value] of Object.entries(configSecrets)) {
    await stack.setConfig(key, { value, secret: true });
  }

  // Same rationale as runPulumiUp — clear any orphaned lock from a
  // dead previous worker so destroy isn't blocked by a stale UUID.
  try {
    await stack.cancel();
  } catch (err) {
    onOutput?.(`[lock] cancel() failed (likely no lock): ${(err as Error).message}\n`);
  }

  await stack.destroy({ onOutput: onOutput ?? (() => {}) });

  if (removeStack) {
    // Removes the empty stack record from the S3 backend. Safe because
    // destroy already removed every managed resource.
    await stack.workspace.removeStack(stackName);
  }
}

export interface StackResourceExport {
  urn: string;
  type: string;
  id?: string;
  parent?: string;
  dependencies?: string[];
  [key: string]: unknown;
}

export async function exportStack(
  workDir: string,
  stackName: string,
  backendBucket: string,
  passphrase: string,
  awsCreds: AwsCredentials,
): Promise<{ resources: StackResourceExport[] }> {
  const envVars = workspaceEnvVars(awsCreds, backendBucket, passphrase);

  const stack = await pulumi.LocalWorkspace.selectStack(
    { stackName, workDir },
    { envVars },
  );

  const exported = await stack.exportStack();
  const deployment = exported.deployment as {
    resources?: StackResourceExport[];
  };

  return { resources: deployment.resources ?? [] };
}
