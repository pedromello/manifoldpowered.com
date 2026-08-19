import { prisma } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import {
  GameArchitecture,
  GameArchiveFormat,
  GameArtifactStatus,
  GamePlatform,
  Prisma,
} from "generated/prisma/client";
import {
  byteSizeSchema,
  installManifestSchema,
  sha256Schema,
} from "contracts/desktop/v1";
import gameRelease from "models/game_release";
import storage from "infra/storage";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const gameArtifactCreateSchema = z.object({
  release_id: z.uuid(),
  platform: z.nativeEnum(GamePlatform),
  architecture: z.nativeEnum(GameArchitecture),
  archive_format: z.nativeEnum(GameArchiveFormat),
  storage_object_key: z.string().trim().min(1).max(1024),
});

const manifestInputSchema = installManifestSchema.omit({
  release_id: true,
  artifact_id: true,
});

export const gameArtifactReadySchema = z.object({
  compressed_size_bytes: byteSizeSchema,
  installed_size_bytes: byteSizeSchema,
  sha256: sha256Schema,
  manifest: manifestInputSchema,
});

const positiveByteSizeSchema = byteSizeSchema.refine(
  (value) => BigInt(value) > BigInt(0),
  "Size must be greater than zero",
);

export const gameArtifactUploadSchema = z.object({
  platform: z.nativeEnum(GamePlatform),
  architecture: z.nativeEnum(GameArchitecture),
  archive_format: z.nativeEnum(GameArchiveFormat),
  compressed_size_bytes: positiveByteSizeSchema,
  installed_size_bytes: positiveByteSizeSchema,
  sha256: sha256Schema,
  manifest: manifestInputSchema,
});

export type GameArtifactCreateDto = z.infer<typeof gameArtifactCreateSchema>;
export type GameArtifactReadyDto = z.infer<typeof gameArtifactReadySchema>;
export type GameArtifactUploadDto = z.infer<typeof gameArtifactUploadSchema>;

const archiveExtensions: Record<GameArchiveFormat, string> = {
  ZIP: "zip",
  TAR_GZ: "tar.gz",
};

async function initiateUpload(
  releaseId: string,
  actorUserId: string,
  input: GameArtifactUploadDto,
) {
  const parsedReleaseId = z.uuid().parse(releaseId);
  const parsedActorUserId = z.uuid().parse(actorUserId);
  const data = gameArtifactUploadSchema.parse(input);
  let result: Awaited<ReturnType<typeof createUploadArtifact>> | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      result = await createUploadArtifact(
        parsedReleaseId,
        parsedActorUserId,
        data,
      );
      break;
    } catch (error) {
      if (attempt < 3 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }

  if (!result) throw new Error("Unreachable artifact upload state");

  const artifact = serialize(result.artifact);
  const upload = await storage.getArtifactUploadAuthorization({
    key: artifact.storage_object_key,
    artifactId: artifact.id,
    archiveFormat: artifact.archive_format,
    compressedSizeBytes: artifact.compressed_size_bytes!,
    sha256: artifact.sha256!,
  });

  return { artifact, upload, created: result.created };
}

async function createUploadArtifact(
  releaseId: string,
  actorUserId: string,
  data: GameArtifactUploadDto,
) {
  return prisma.$transaction(
    async (tx) => {
      const release = await tx.gameRelease.findUnique({
        where: { id: releaseId },
      });
      if (!release) {
        throw new NotFoundError({
          message: `Release "${releaseId}" was not found.`,
          action: "Check the release id and try again.",
        });
      }
      gameRelease.assertReleaseMutable(release);

      const existing = await tx.gameArtifact.findUnique({
        where: {
          release_id_platform_architecture: {
            release_id: releaseId,
            platform: data.platform,
            architecture: data.architecture,
          },
        },
      });

      if (existing) {
        if (isSameUploadDeclaration(existing, data)) {
          return { artifact: existing, created: false };
        }

        throw new ValidationError({
          message: `Release "${releaseId}" already has an artifact for ${data.platform}/${data.architecture}.`,
          action:
            "Remove the unpublished artifact before uploading a replacement with different metadata.",
        });
      }

      const artifactId = randomUUID();
      const manifest = installManifestSchema.parse({
        ...data.manifest,
        release_id: releaseId,
        artifact_id: artifactId,
      });
      const storageObjectKey = [
        "games",
        release.game_id,
        "releases",
        releaseId,
        "artifacts",
        `${artifactId}.${archiveExtensions[data.archive_format]}`,
      ].join("/");

      const artifact = await tx.gameArtifact.create({
        data: {
          id: artifactId,
          release_id: releaseId,
          platform: data.platform,
          architecture: data.architecture,
          archive_format: data.archive_format,
          storage_object_key: storageObjectKey,
          created_by_user_id: actorUserId,
          compressed_size_bytes: BigInt(data.compressed_size_bytes),
          installed_size_bytes: BigInt(data.installed_size_bytes),
          sha256: data.sha256,
          manifest_schema_version: manifest.schema_version,
          manifest: manifest as Prisma.InputJsonValue,
        },
      });

      return { artifact, created: true };
    },
    { isolationLevel: "Serializable" },
  );
}

function isSameUploadDeclaration(
  artifact: {
    platform: GamePlatform;
    architecture: GameArchitecture;
    archive_format: GameArchiveFormat;
    compressed_size_bytes: bigint | null;
    installed_size_bytes: bigint | null;
    sha256: string | null;
    manifest: Prisma.JsonValue | null;
    status: GameArtifactStatus;
  },
  data: GameArtifactUploadDto,
) {
  if (!artifact.manifest || typeof artifact.manifest !== "object") return false;
  if (Array.isArray(artifact.manifest)) return false;
  const manifestInput = { ...artifact.manifest };
  delete manifestInput.release_id;
  delete manifestInput.artifact_id;

  return (
    artifact.status === GameArtifactStatus.PENDING &&
    artifact.platform === data.platform &&
    artifact.architecture === data.architecture &&
    artifact.archive_format === data.archive_format &&
    artifact.compressed_size_bytes?.toString() === data.compressed_size_bytes &&
    artifact.installed_size_bytes?.toString() === data.installed_size_bytes &&
    artifact.sha256 === data.sha256 &&
    isDeepStrictEqual(manifestInput, data.manifest)
  );
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function createPending(input: GameArtifactCreateDto) {
  const data = gameArtifactCreateSchema.parse(input);
  return prisma.$transaction(
    async (tx) => {
      const release = await tx.gameRelease.findUnique({
        where: { id: data.release_id },
      });
      if (!release) {
        throw new NotFoundError({
          message: `Release "${data.release_id}" was not found.`,
          action: "Check the release id and try again.",
        });
      }
      gameRelease.assertReleaseMutable(release);

      return tx.gameArtifact.create({ data });
    },
    { isolationLevel: "Serializable" },
  );
}

async function findById(id: string) {
  const artifact = await prisma.gameArtifact.findUnique({ where: { id } });
  if (!artifact) throw artifactNotFound(id);
  return serialize(artifact);
}

async function markVerifying(id: string) {
  return transition(
    id,
    [GameArtifactStatus.PENDING, GameArtifactStatus.FAILED],
    GameArtifactStatus.VERIFYING,
  );
}

async function markFailed(id: string) {
  return transition(
    id,
    [GameArtifactStatus.VERIFYING],
    GameArtifactStatus.FAILED,
  );
}

async function markReady(id: string, input: GameArtifactReadyDto) {
  const data = gameArtifactReadySchema.parse(input);

  const artifact = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.gameArtifact.findUnique({ where: { id } });
      if (!existing) throw artifactNotFound(id);
      if (existing.status !== GameArtifactStatus.VERIFYING) {
        throw invalidTransition(id, existing.status, GameArtifactStatus.READY);
      }

      const release = await tx.gameRelease.findUnique({
        where: { id: existing.release_id },
      });
      if (!release) {
        throw new NotFoundError({
          message: `Release "${existing.release_id}" was not found.`,
          action: "Check the artifact's release reference.",
        });
      }
      gameRelease.assertReleaseMutable(release);

      const manifest = installManifestSchema.parse({
        ...data.manifest,
        release_id: existing.release_id,
        artifact_id: existing.id,
      });

      return tx.gameArtifact.update({
        where: { id },
        data: {
          compressed_size_bytes: BigInt(data.compressed_size_bytes),
          installed_size_bytes: BigInt(data.installed_size_bytes),
          sha256: data.sha256,
          manifest_schema_version: manifest.schema_version,
          manifest: manifest as Prisma.InputJsonValue,
          status: GameArtifactStatus.READY,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );

  return serialize(artifact);
}

async function remove(id: string) {
  const artifact = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.gameArtifact.findUnique({ where: { id } });
      if (!existing) throw artifactNotFound(id);

      const release = await tx.gameRelease.findUnique({
        where: { id: existing.release_id },
      });
      if (!release) {
        throw new NotFoundError({
          message: `Release "${existing.release_id}" was not found.`,
          action: "Check the artifact's release reference.",
        });
      }
      gameRelease.assertReleaseMutable(release);

      return tx.gameArtifact.delete({ where: { id } });
    },
    { isolationLevel: "Serializable" },
  );

  // Storage cleanup is intentionally after the database commit: a failed or
  // abandoned upload must not keep the unique target slot occupied. The
  // storage adapter logs deletion failures, and Phase 4 adds orphan cleanup.
  await storage.deleteFile(artifact.storage_object_key);
}

async function transition(
  id: string,
  from: GameArtifactStatus[],
  to: GameArtifactStatus,
) {
  const artifact = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.gameArtifact.findUnique({ where: { id } });
      if (!existing) throw artifactNotFound(id);

      const release = await tx.gameRelease.findUnique({
        where: { id: existing.release_id },
      });
      if (!release) {
        throw new NotFoundError({
          message: `Release "${existing.release_id}" was not found.`,
          action: "Check the artifact's release reference.",
        });
      }
      gameRelease.assertReleaseMutable(release);

      const result = await tx.gameArtifact.updateMany({
        where: { id, status: { in: from } },
        data: { status: to },
      });
      if (result.count === 0) {
        throw invalidTransition(id, existing.status, to);
      }

      return tx.gameArtifact.findUniqueOrThrow({ where: { id } });
    },
    { isolationLevel: "Serializable" },
  );

  return serialize(artifact);
}

function serialize<
  T extends {
    compressed_size_bytes: bigint | null;
    installed_size_bytes: bigint | null;
  },
>(artifact: T) {
  return {
    ...artifact,
    compressed_size_bytes: artifact.compressed_size_bytes?.toString() ?? null,
    installed_size_bytes: artifact.installed_size_bytes?.toString() ?? null,
  };
}

function artifactNotFound(id: string) {
  return new NotFoundError({
    message: `Artifact "${id}" was not found.`,
    action: "Check the artifact id and try again.",
  });
}

function invalidTransition(
  id: string,
  from: GameArtifactStatus,
  to: GameArtifactStatus,
) {
  return new ValidationError({
    message: `Artifact "${id}" cannot transition from ${from} to ${to}.`,
    action: "Use the next valid verification workflow state.",
  });
}

const gameArtifact = {
  initiateUpload,
  createPending,
  findById,
  markVerifying,
  markFailed,
  markReady,
  remove,
};

export default gameArtifact;
