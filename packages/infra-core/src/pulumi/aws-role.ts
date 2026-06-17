import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { getPlatformAwsCredentials } from "./platform-credentials";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
}

export async function assumeCustomerRole(
  roleArn: string,
  externalId: string,
  region: string,
): Promise<AwsCredentials> {
  const platformCreds = getPlatformAwsCredentials();
  const sts = new STSClient({
    region,
    credentials: platformCreds,
  });

  const result = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `heizen-${Date.now()}`,
      ExternalId: externalId,
      DurationSeconds: 3600,
    }),
  );

  if (!result.Credentials) {
    throw new Error(`Failed to assume role: ${roleArn}`);
  }

  return {
    accessKeyId: result.Credentials.AccessKeyId!,
    secretAccessKey: result.Credentials.SecretAccessKey!,
    sessionToken: result.Credentials.SessionToken!,
    region,
  };
}

const ARN_ACCOUNT_RE = /^arn:aws:iam::(\d{12}):role\//;

/**
 * Extracts the 12-digit AWS account id from a role ARN
 * (arn:aws:iam::<account>:role/<name>). Returns null for a missing or
 * malformed ARN — the account is always derived from the role, never asked.
 */
export function accountIdFromRoleArn(
  roleArn: string | null | undefined,
): string | null {
  if (!roleArn) return null;
  return ARN_ACCOUNT_RE.exec(roleArn)?.[1] ?? null;
}
