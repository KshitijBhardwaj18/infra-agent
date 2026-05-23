import * as pulumi from "@pulumi/pulumi/automation";
import type { AwsCredentials } from "./aws-role";

export interface PulumiUpOptions {
  workDir: string;
  stackName: string;
  backendBucket: string;
  passphrase: string;
  awsCreds: AwsCredentials;
  configSecrets: Record<string, string>;
  onOutput?: (line: string) => void;
}

export interface PulumiUpResult {
  outputs: Record<string, unknown>;
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
    onOutput,
  } = options;

  process.env.AWS_ACCESS_KEY_ID = awsCreds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = awsCreds.secretAccessKey;
  process.env.AWS_SESSION_TOKEN = awsCreds.sessionToken;
  process.env.AWS_DEFAULT_REGION = awsCreds.region;
  process.env.PULUMI_BACKEND_URL = `s3://${backendBucket}`;
  process.env.PULUMI_CONFIG_PASSPHRASE = passphrase;

  const stack = await pulumi.LocalWorkspace.createOrSelectStack(
    {
      stackName,
      projectName: stackName.split("/")[0] ?? stackName,
      program: async () => {
        // Program runs from generated index.ts via workDir
      },
    },
    {
      workDir,
      envVars: {
        AWS_ACCESS_KEY_ID: awsCreds.accessKeyId,
        AWS_SECRET_ACCESS_KEY: awsCreds.secretAccessKey,
        AWS_SESSION_TOKEN: awsCreds.sessionToken,
        AWS_DEFAULT_REGION: awsCreds.region,
        PULUMI_BACKEND_URL: `s3://${backendBucket}`,
        PULUMI_CONFIG_PASSPHRASE: passphrase,
      },
    },
  );

  for (const [key, value] of Object.entries(configSecrets)) {
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
  process.env.AWS_ACCESS_KEY_ID = awsCreds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = awsCreds.secretAccessKey;
  process.env.AWS_SESSION_TOKEN = awsCreds.sessionToken;
  process.env.AWS_DEFAULT_REGION = awsCreds.region;
  process.env.PULUMI_BACKEND_URL = `s3://${backendBucket}`;
  process.env.PULUMI_CONFIG_PASSPHRASE = passphrase;

  const stack = await pulumi.LocalWorkspace.selectStack(
    {
      stackName,
      projectName: stackName.split("/")[0] ?? stackName,
      program: async () => {},
    },
    {
      workDir,
      envVars: {
        AWS_ACCESS_KEY_ID: awsCreds.accessKeyId,
        AWS_SECRET_ACCESS_KEY: awsCreds.secretAccessKey,
        AWS_SESSION_TOKEN: awsCreds.sessionToken,
        AWS_DEFAULT_REGION: awsCreds.region,
        PULUMI_BACKEND_URL: `s3://${backendBucket}`,
        PULUMI_CONFIG_PASSPHRASE: passphrase,
      },
    },
  );

  const exported = await stack.exportStack();
  const deployment = exported.deployment as {
    resources?: StackResourceExport[];
  };

  return { resources: deployment.resources ?? [] };
}
