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
import { GameArchiveFormat } from "generated/prisma/client";

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

const ARTIFACT_CONTENT_TYPES: Record<GameArchiveFormat, string> = {
  ZIP: "application/zip",
  TAR_GZ: "application/gzip",
};

export interface ArtifactUploadAuthorization {
  url: string;
  expires_at: string;
  required_headers: Record<string, string>;
}

export async function getArtifactUploadAuthorization({
  key,
  artifactId,
  archiveFormat,
  compressedSizeBytes,
  sha256,
}: {
  key: string;
  artifactId: string;
  archiveFormat: GameArchiveFormat;
  compressedSizeBytes: string;
  sha256: string;
}): Promise<ArtifactUploadAuthorization> {
  const contentType = ARTIFACT_CONTENT_TYPES[archiveFormat];
  const checksum = Buffer.from(sha256, "hex").toString("base64");
  const requiredHeaders = {
    "content-type": contentType,
    "x-amz-checksum-sha256": checksum,
    "x-amz-meta-artifact-id": artifactId,
    "x-amz-meta-declared-size-bytes": compressedSizeBytes,
    "x-amz-meta-sha256": sha256,
  };
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    ChecksumSHA256: checksum,
    Metadata: {
      "artifact-id": artifactId,
      "declared-size-bytes": compressedSizeBytes,
      sha256,
    },
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_EXPIRES_IN_SECONDS,
    // Keep integrity metadata in the signed headers instead of hoisting it to
    // the query string. The uploader must send exactly these values.
    unhoistableHeaders: new Set(Object.keys(requiredHeaders).slice(1)),
    signableHeaders: new Set(["content-type"]),
  });

  return {
    url,
    expires_at: new Date(
      Date.now() + UPLOAD_EXPIRES_IN_SECONDS * 1000,
    ).toISOString(),
    required_headers: requiredHeaders,
  };
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
  getArtifactUploadAuthorization,
  getDownloadUrl,
  deleteFile,
  clearAllBuckets,
  createBucket,
  UPLOAD_EXPIRES_IN_SECONDS,
  DOWNLOAD_EXPIRES_IN_SECONDS,
};

export default storage;
