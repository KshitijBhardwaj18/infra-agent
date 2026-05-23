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
