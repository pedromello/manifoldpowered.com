import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  ListObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { InternalServerError } from "./errors";

const s3Client = new S3Client({
  region: process.env.NODE_ENV === "production" ? "auto" : "us-east-1",
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.STORAGE_SECRET_KEY,
  },
  // Ensure path-style routing is false for R2, but true for MinIO.
  // R2 uses virtual-hosted style (bucket.domain) or path depending on setup.
  forcePathStyle: process.env.NODE_ENV === "production" ? false : true,
});

const bucketName = process.env.STORAGE_BUCKET_NAME;
const UPLOAD_EXPIRES_IN_SECONDS = 3600; // 1 hour
let DOWNLOAD_EXPIRES_IN_SECONDS = 60; // 1 minute

// My PC has a some minutes delay that impact on this test
if (process.env.NODE_ENV !== "production") {
  DOWNLOAD_EXPIRES_IN_SECONDS = 3600;
}

export async function getUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_EXPIRES_IN_SECONDS,
  });
}

export async function getDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: DOWNLOAD_EXPIRES_IN_SECONDS,
  });
}

export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error("Failed to delete file from S3:", error);
    // We ignore deletion errors from S3 (e.g. Bucket does not exist locally)
    // to avoid breaking the application state when S3 is unavailable.
  }
}

export async function clearAllBuckets(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot clear buckets in production environment");
  }

  try {
    // List all buckets
    const listBucketsResponse = await s3Client.send(new ListBucketsCommand({}));
    const buckets = listBucketsResponse.Buckets || [];

    for (const bucket of buckets) {
      if (!bucket.Name) continue;

      // Delete all objects in the bucket
      const listObjectsResponse = await s3Client.send(
        new ListObjectsCommand({
          Bucket: bucket.Name,
        }),
      );
      const objects = listObjectsResponse.Contents || [];

      for (const object of objects) {
        if (!object.Key) continue;
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket.Name,
            Key: object.Key,
          }),
        );
      }

      // Delete bucket
      await s3Client.send(new DeleteBucketCommand({ Bucket: bucket.Name }));
    }
  } catch (error) {
    console.error("Failed to delete all buckets:", error);
    throw new InternalServerError({
      cause: error,
      action: "Contact the administrator if this error persists.",
    });
  }
}

export async function createBucket(
  newBucketName: string = bucketName,
): Promise<void> {
  await s3Client.send(new CreateBucketCommand({ Bucket: newBucketName }));
}

const storage = {
  getUploadUrl,
  getDownloadUrl,
  deleteFile,
  clearAllBuckets,
  createBucket,
  UPLOAD_EXPIRES_IN_SECONDS,
  DOWNLOAD_EXPIRES_IN_SECONDS,
};

export default storage;
