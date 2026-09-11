/**
 * Create the S3/LocalStack bucket from Windows/macOS/Linux without `awslocal`.
 *
 * Usage (repo root):
 *   pnpm run storage:ensure-bucket
 */
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

for (const envFile of [".env", "../.env", "../../.env"]) {
  if (existsSync(envFile)) {
    loadEnvFile(envFile);
    break;
  }
}

const bucket = process.env.STORAGE_BUCKET || "endokrina-documents";
const region = process.env.AWS_REGION || "eu-central-1";
const endpoint = process.env.AWS_ENDPOINT_URL || "http://localhost:4566";

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
  },
});

async function main() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket already exists: ${bucket} @ ${endpoint}`);
    return;
  } catch {
    // create
  }

  await s3.send(
    new CreateBucketCommand({
      Bucket: bucket,
      ...(region !== "us-east-1"
        ? { CreateBucketConfiguration: { LocationConstraint: region as never } }
        : {}),
    }),
  );
  console.log(`Created bucket: ${bucket} @ ${endpoint}`);
}

main().catch((err) => {
  console.error("Failed to ensure storage bucket.");
  console.error("Is LocalStack running?  pnpm run dev:infra");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
