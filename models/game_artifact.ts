import { prisma } from "infra/database";
import { NotFoundError, ServiceError, ValidationError } from "infra/errors";
import {
  GameArchitecture,
  GameArchiveFormat,
  GameArtifactStatus,
  GamePlatform,
  GameReleaseStatus,
  Prisma,
} from "generated/prisma/client";
import {
  archiveFormatSchema,
  byteSizeSchema,
  downloadAuthorizationSchema,
  installManifestSchema,
  sha256Schema,
} from "contracts/desktop/v1";
import gameRelease from "models/game_release";
import storage, { type ArtifactObjectMetadata } from "infra/storage";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import authorizationModel from "models/authorization";
import game from "models/game";
import library from "models/library";

export class ArtifactIntegrityError extends ServiceError {
  constructor(message: string, cause?: unknown) {
    super({
      message,
      cause,
      action: "Contact the publisher before retrying the download",
    });
    this.name = "ArtifactIntegrityError";
  }
}

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
  archive_format: archiveFormatSchema,
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

const archiveContentTypes: Record<GameArchiveFormat, string> = {
  ZIP: "application/zip",
  TAR_GZ: "application/gzip",
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

async function confirmUpload(id: string) {
  const artifactId = z.uuid().parse(id);
  const claimed = await claimVerification(artifactId);

  if (claimed.already_published) {
    return {
      artifact: serialize(claimed.artifact),
      release: claimed.release,
      published: true,
    };
  }

  if (claimed.needs_verification) {
    try {
      const object = await storage.getArtifactObjectMetadata(
        claimed.artifact.storage_object_key,
      );
      validateStoredArtifact(claimed.artifact, object);
    } catch (error) {
      if (error instanceof ValidationError) {
        await failVerification(artifactId);
      }
      throw error;
    }
  }

  return finalizeVerificationAndPublication(artifactId);
}

async function claimVerification(id: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const artifact = await tx.gameArtifact.findUnique({ where: { id } });
          if (!artifact) throw artifactNotFound(id);
          const release = await tx.gameRelease.findUnique({
            where: { id: artifact.release_id },
          });
          if (!release) {
            throw new NotFoundError({
              message: `Release "${artifact.release_id}" was not found.`,
              action: "Check the artifact's release reference.",
            });
          }

          if (
            artifact.status === GameArtifactStatus.READY &&
            release.status === GameReleaseStatus.PUBLISHED
          ) {
            return {
              artifact,
              release,
              needs_verification: false,
              already_published: true,
            };
          }

          gameRelease.assertReleaseMutable(release);

          const needsVerification =
            artifact.status !== GameArtifactStatus.READY;
          if (
            artifact.status !== GameArtifactStatus.PENDING &&
            artifact.status !== GameArtifactStatus.FAILED &&
            artifact.status !== GameArtifactStatus.VERIFYING &&
            artifact.status !== GameArtifactStatus.READY
          ) {
            throw invalidTransition(
              artifact.id,
              artifact.status,
              GameArtifactStatus.READY,
            );
          }

          const claimedArtifact =
            artifact.status === GameArtifactStatus.PENDING ||
            artifact.status === GameArtifactStatus.FAILED
              ? await tx.gameArtifact.update({
                  where: { id },
                  data: { status: GameArtifactStatus.VERIFYING },
                })
              : artifact;

          const processingRelease =
            release.status === GameReleaseStatus.DRAFT ||
            release.status === GameReleaseStatus.FAILED
              ? await tx.gameRelease.update({
                  where: { id: release.id },
                  data: { status: GameReleaseStatus.PROCESSING },
                })
              : release;

          return {
            artifact: claimedArtifact,
            release: processingRelease,
            needs_verification: needsVerification,
            already_published: false,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 3 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }

  throw new Error("Unreachable artifact verification claim state");
}

function validateStoredArtifact(
  artifact: {
    id: string;
    release_id: string;
    archive_format: GameArchiveFormat;
    compressed_size_bytes: bigint | null;
    installed_size_bytes: bigint | null;
    sha256: string | null;
    manifest_schema_version: string | null;
    manifest: Prisma.JsonValue | null;
  },
  object: ArtifactObjectMetadata | null,
) {
  if (!object) {
    throw verificationError(
      artifact.id,
      "The uploaded artifact was not found in storage.",
    );
  }
  if (
    !artifact.compressed_size_bytes ||
    !artifact.installed_size_bytes ||
    !artifact.sha256 ||
    !artifact.manifest_schema_version
  ) {
    throw verificationError(
      artifact.id,
      "The artifact is missing required declared integrity metadata.",
    );
  }

  const declaredSize = artifact.compressed_size_bytes.toString();
  const expectedChecksum = Buffer.from(artifact.sha256, "hex").toString(
    "base64",
  );
  const mismatches: string[] = [];

  if (object.size_bytes !== declaredSize) mismatches.push("compressed size");
  if (object.checksum_sha256 !== expectedChecksum) mismatches.push("SHA-256");
  if (object.content_type !== archiveContentTypes[artifact.archive_format]) {
    mismatches.push("archive content type");
  }
  if (object.metadata["artifact-id"] !== artifact.id) {
    mismatches.push("artifact identity metadata");
  }
  if (object.metadata["declared-size-bytes"] !== declaredSize) {
    mismatches.push("declared size metadata");
  }
  if (object.metadata.sha256 !== artifact.sha256) {
    mismatches.push("SHA-256 metadata");
  }

  if (mismatches.length > 0) {
    throw verificationError(
      artifact.id,
      `Storage verification failed for: ${mismatches.join(", ")}.`,
    );
  }

  const manifest = installManifestSchema.safeParse(artifact.manifest);
  if (
    !manifest.success ||
    manifest.data.release_id !== artifact.release_id ||
    manifest.data.artifact_id !== artifact.id ||
    manifest.data.schema_version !== artifact.manifest_schema_version
  ) {
    throw verificationError(
      artifact.id,
      "The persisted install manifest is invalid or belongs to another artifact.",
      manifest.success ? undefined : manifest.error,
    );
  }
}

async function failVerification(id: string) {
  await prisma.$transaction(
    async (tx) => {
      const artifact = await tx.gameArtifact.findUnique({ where: { id } });
      if (!artifact || artifact.status !== GameArtifactStatus.VERIFYING) return;

      await tx.gameArtifact.update({
        where: { id },
        data: { status: GameArtifactStatus.FAILED },
      });
      await tx.gameRelease.updateMany({
        where: {
          id: artifact.release_id,
          status: GameReleaseStatus.PROCESSING,
        },
        data: { status: GameReleaseStatus.FAILED },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

async function finalizeVerificationAndPublication(id: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const artifact = await tx.gameArtifact.findUnique({
            where: { id },
          });
          if (!artifact) throw artifactNotFound(id);
          const release = await tx.gameRelease.findUnique({
            where: { id: artifact.release_id },
          });
          if (!release) {
            throw new NotFoundError({
              message: `Release "${artifact.release_id}" was not found.`,
              action: "Check the artifact's release reference.",
            });
          }

          if (
            artifact.status === GameArtifactStatus.READY &&
            release.status === GameReleaseStatus.PUBLISHED
          ) {
            return { artifact, release, published: true };
          }
          gameRelease.assertReleaseMutable(release);
          if (
            artifact.status !== GameArtifactStatus.VERIFYING &&
            artifact.status !== GameArtifactStatus.READY
          ) {
            throw invalidTransition(
              artifact.id,
              artifact.status,
              GameArtifactStatus.READY,
            );
          }

          const manifest = installManifestSchema.safeParse(artifact.manifest);
          if (
            !manifest.success ||
            manifest.data.release_id !== artifact.release_id ||
            manifest.data.artifact_id !== artifact.id ||
            manifest.data.schema_version !== artifact.manifest_schema_version
          ) {
            throw verificationError(
              artifact.id,
              "The persisted install manifest is invalid or belongs to another artifact.",
              manifest.success ? undefined : manifest.error,
            );
          }

          const readyArtifact =
            artifact.status === GameArtifactStatus.READY
              ? artifact
              : await tx.gameArtifact.update({
                  where: { id },
                  data: { status: GameArtifactStatus.READY },
                });
          const incompleteArtifacts = await tx.gameArtifact.count({
            where: {
              release_id: release.id,
              id: { not: id },
              status: { not: GameArtifactStatus.READY },
            },
          });

          if (incompleteArtifacts > 0) {
            const processingRelease =
              release.status === GameReleaseStatus.PROCESSING
                ? release
                : await tx.gameRelease.update({
                    where: { id: release.id },
                    data: { status: GameReleaseStatus.PROCESSING },
                  });
            return {
              artifact: readyArtifact,
              release: processingRelease,
              published: false,
            };
          }

          const publishedRelease = await tx.gameRelease.update({
            where: { id: release.id },
            data: {
              status: GameReleaseStatus.PUBLISHED,
              published_at: release.published_at ?? new Date(),
            },
          });
          return {
            artifact: readyArtifact,
            release: publishedRelease,
            published: true,
          };
        },
        { isolationLevel: "Serializable" },
      );

      return { ...result, artifact: serialize(result.artifact) };
    } catch (error) {
      if (attempt < 3 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }

  throw new Error("Unreachable artifact confirmation state");
}

function verificationError(id: string, message: string, cause?: unknown) {
  return new ValidationError({
    message,
    cause,
    action: `Correct or replace artifact "${id}", then retry confirmation.`,
  });
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

async function authorizeDownload(
  id: string,
  user: Parameters<typeof authorizationModel.can>[0],
) {
  const artifactId = z.uuid().parse(id);
  const artifact = await prisma.gameArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) return { state: "MISSING" } as const;

  const release = await prisma.gameRelease.findUnique({
    where: { id: artifact.release_id },
  });
  if (!release) return { state: "MISSING" } as const;
  if (release.status === GameReleaseStatus.RETIRED) {
    return { state: "RETIRED", release } as const;
  }
  if (
    release.status !== GameReleaseStatus.PUBLISHED ||
    !release.published_at ||
    artifact.status !== GameArtifactStatus.READY ||
    artifact.archive_format !== GameArchiveFormat.ZIP
  ) {
    return { state: "UNAVAILABLE" } as const;
  }

  const size = artifact.compressed_size_bytes?.toString();
  const sha256 = sha256Schema.safeParse(artifact.sha256);
  if (!size || !sha256.success) {
    throw new ArtifactIntegrityError(
      "The published artifact is missing required integrity metadata",
      sha256.success ? undefined : sha256.error,
    );
  }

  const object = await storage.getArtifactObjectMetadata(
    artifact.storage_object_key,
  );
  if (!object) {
    throw new ArtifactIntegrityError(
      "The published artifact was not found in storage",
    );
  }

  const expectedChecksum = Buffer.from(sha256.data, "hex").toString("base64");
  if (
    object.size_bytes !== size ||
    object.checksum_sha256 !== expectedChecksum ||
    object.content_type !== "application/zip" ||
    object.metadata["artifact-id"] !== artifact.id ||
    object.metadata["declared-size-bytes"] !== size ||
    object.metadata.sha256 !== sha256.data
  ) {
    throw new ArtifactIntegrityError(
      "The stored artifact failed download integrity validation",
    );
  }

  const gameResource = await game.findOneByIdWithStudio(release.game_id);
  if (!gameResource) {
    throw new ArtifactIntegrityError(
      "The published artifact references a missing game",
    );
  }
  const hasGameOwnership = authorizationModel.can(
    user,
    "update:game",
    gameResource,
  );
  const hasEntitlement = user.id
    ? await library.hasItem(user.id, gameResource.id)
    : false;
  if (!hasGameOwnership && !hasEntitlement) {
    return { state: "FORBIDDEN" } as const;
  }

  const finalArtifact = await prisma.gameArtifact.findUnique({
    where: { id: artifact.id },
  });
  if (!finalArtifact) return { state: "MISSING" } as const;
  const finalRelease = await prisma.gameRelease.findUnique({
    where: { id: finalArtifact.release_id },
  });
  if (!finalRelease) return { state: "MISSING" } as const;
  if (finalRelease.status === GameReleaseStatus.RETIRED) {
    return { state: "RETIRED", release: finalRelease } as const;
  }
  if (
    finalRelease.status !== GameReleaseStatus.PUBLISHED ||
    !finalRelease.published_at ||
    finalArtifact.status !== GameArtifactStatus.READY ||
    finalArtifact.archive_format !== GameArchiveFormat.ZIP
  ) {
    return { state: "UNAVAILABLE" } as const;
  }
  if (
    finalArtifact.storage_object_key !== artifact.storage_object_key ||
    finalArtifact.compressed_size_bytes?.toString() !== size ||
    finalArtifact.sha256 !== sha256.data
  ) {
    throw new ArtifactIntegrityError(
      "The artifact metadata changed during download authorization",
    );
  }

  const signed = await storage.getArtifactDownloadAuthorization(
    finalArtifact.storage_object_key,
  );
  const authorization = downloadAuthorizationSchema.parse({
    artifact_id: artifact.id,
    url: signed.url,
    expires_at: signed.expires_at,
    total_size_bytes: size,
    sha256: sha256.data,
    ...(object.etag ? { etag: object.etag } : {}),
  });

  return { state: "AUTHORIZED", authorization } as const;
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
  confirmUpload,
  createPending,
  findById,
  authorizeDownload,
  markVerifying,
  markFailed,
  markReady,
  remove,
};

export default gameArtifact;
