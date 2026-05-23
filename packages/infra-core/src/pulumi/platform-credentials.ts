export interface PlatformAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export function getPlatformAwsCredentials(): PlatformAwsCredentials {
  const accessKeyId = process.env.PLATFORM_AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.PLATFORM_AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.PLATFORM_AWS_SESSION_TOKEN?.trim();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Platform AWS credentials are not configured. Set PLATFORM_AWS_ACCESS_KEY_ID and PLATFORM_AWS_SECRET_ACCESS_KEY in apps/api/.env",
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: sessionToken || undefined,
  };
}
