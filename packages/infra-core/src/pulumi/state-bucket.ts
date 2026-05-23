import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";

export async function ensureStateBucket(
  s3Client: S3Client,
  bucketName: string,
  region: string,
): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return;
  } catch {
    // bucket does not exist — create it
  }

  await s3Client.send(
    new CreateBucketCommand({
      Bucket: bucketName,
      ...(region !== "us-east-1"
        ? { CreateBucketConfiguration: { LocationConstraint: region as never } }
        : {}),
    }),
  );

  await s3Client.send(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );

  await s3Client.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    }),
  );
}
