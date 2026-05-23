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

  const upResult = await stack.up({
    onOutput: onOutput ?? (() => {}),
  });

  return { outputs: upResult.outputs as Record<string, unknown> };
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
