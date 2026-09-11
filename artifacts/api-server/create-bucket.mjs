import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "eu-central-1",
  endpoint: "http://localhost:4566",
  forcePathStyle: true,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

try {
  await s3.send(new CreateBucketCommand({ Bucket: "endokrina-documents" }));
  console.log("Bucket created: endokrina-documents");
} catch (err) {
  if (err.name === "BucketAlreadyOwnedByYou") {
    console.log("Bucket already exists — fine.");
  } else {
    throw err;
  }
}