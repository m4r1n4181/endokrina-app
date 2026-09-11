import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";
import { logger } from "./logger";

const s3 = new S3Client({
  region: config.AWS_REGION,
  endpoint: config.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: Boolean(config.AWS_ENDPOINT_URL),
  credentials:
    config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY }
      : undefined,
});

function requireBucket(): string {
  if (!config.STORAGE_BUCKET) {
    throw new Error("STORAGE_BUCKET must be set when STORAGE_PROVIDER=s3");
  }
  return config.STORAGE_BUCKET;
}

export async function ensureStorageBucket(): Promise<void> {
  if (config.STORAGE_PROVIDER !== "s3") return;
  const bucket = requireBucket();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    await s3.send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...(config.AWS_REGION !== "us-east-1"
          ? { CreateBucketConfiguration: { LocationConstraint: config.AWS_REGION as never } }
          : {}),
      }),
    );
    logger.info({ bucket, endpoint: config.AWS_ENDPOINT_URL }, "Created object-storage bucket");
  }
}

export async function saveS3Document(storageKey: string, fileBytes: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: requireBucket(),
    Key: storageKey,
    Body: fileBytes,
    ContentType: contentType,
    ServerSideEncryption: config.AWS_ENDPOINT_URL ? undefined : "AES256",
  }));
}

export async function readS3Document(storageKey: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: requireBucket(), Key: storageKey }));
  const chunks: Buffer[] = [];
  for await (const chunk of result.Body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}