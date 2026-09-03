import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  PATCH_MAX_FULL_SIZE_PERCENT,
  patchDownloadAuthorizationsSchema,
  releasePatchSchema,
  releasePatchUploadRequestSchema,
  updatePlanSchema,
  type ReleasePatchUploadRequest,
} from "contracts/desktop/v1";
import {
  GameArchitecture,
  GameArchiveFormat,
  GameArtifactStatus,
  GamePlatform,
  GameReleasePatch,
  GameReleasePatchStatus,
  GameReleaseStatus,
  Prisma,
} from "generated/prisma/client";
import { prisma } from "infra/database";
import { NotFoundError, ServiceError, ValidationError } from "infra/errors";
import storage, {
  type PatchFileKind,
  type PatchObjectMetadata,
} from "infra/storage";
import library from "models/library";
import { z } from "zod";

const PATCH_CONTENT_TYPES: Record<PatchFileKind, string> = {
  PATCH: "application/vnd.manifold.wharf-patch",
  SIGNATURE: "application/vnd.manifold.wharf-signature",
};

export class PatchIntegrityError extends ServiceError {
  constructor(message: string, cause?: unknown) {
    super({
      message,
      cause,
      action: "Use the full artifact fallback and notify the publisher",
    });
    this.name = "PatchIntegrityError";
  }
}

async function initiateUpload(
  targetReleaseId: string,
  actorUserId: string,
  input: ReleasePatchUploadRequest,
) {
  const parsedTargetReleaseId = z.uuid().parse(targetReleaseId);
  const parsedActorUserId = z.uuid().parse(actorUserId);
  const data = releasePatchUploadRequestSchema.parse(input);

  const result = await withTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const references = await validateReferences(
          tx,
          parsedTargetReleaseId,
          data.source_release_id,
          data.platform,
          data.architecture,
          true,
        );

        const existing = await tx.gameReleasePatch.findUnique({
          where: {
            source_release_id_target_release_id_platform_architecture: {
              source_release_id: data.source_release_id,
              target_release_id: parsedTargetReleaseId,
              platform: data.platform,
              architecture: data.architecture,
            },
          },
        });

        if (existing) {
          if (!isSameDeclaration(existing, data)) {
            throw new ValidationError({
              message:
                "A different patch is already declared for this release transition and target",
              action:
                "Reuse the original declaration or create a new target release",
            });
          }
          assertTargetArtifactBinding(existing, references.targetArtifact);

          return { patch: existing, created: false, gameId: references.gameId };
        }

        const patchId = randomUUID();
        const objectPrefix = [
          "games",
          references.gameId,
          "releases",
          parsedTargetReleaseId,
          "patches",
          patchId,
        ].join("/");
        const patch = await tx.gameReleasePatch.create({
          data: {
            id: patchId,
            source_release_id: data.source_release_id,
            target_release_id: parsedTargetReleaseId,
            target_artifact_id: references.targetArtifact.id,
            target_artifact_sha256: references.targetArtifact.sha256!,
            platform: data.platform,
            architecture: data.architecture,
            algorithm: data.algorithm,
            format_version: data.format_version,
            patch_storage_object_key: `${objectPrefix}.pwr`,
            patch_size_bytes: BigInt(data.patch.size_bytes),
            patch_sha256: data.patch.sha256,
            signature_storage_object_key: `${objectPrefix}.pwr.sig`,
            signature_size_bytes: BigInt(data.signature.size_bytes),
            signature_sha256: data.signature.sha256,
            expected_installation_sha256: data.expected_installation_sha256,
            created_by_user_id: parsedActorUserId,
            generation_duration_ms: BigInt(data.generation_duration_ms),
          },
        });

        return { patch, created: true, gameId: references.gameId };
      },
      { isolationLevel: "Serializable" },
    ),
  );

  const patch = serialize(result.patch);
  if (patch.status === GameReleasePatchStatus.READY) {
    return { patch, uploads: null, created: result.created };
  }

  const [patchUpload, signatureUpload] = await Promise.all([
    storage.getPatchUploadAuthorization({
      key: patch.patch_storage_object_key,
      patchId: patch.id,
      file: "PATCH",
      sizeBytes: patch.patch_size_bytes,
      sha256: patch.patch_sha256,
    }),
    storage.getPatchUploadAuthorization({
      key: patch.signature_storage_object_key,
      patchId: patch.id,
      file: "SIGNATURE",
      sizeBytes: patch.signature_size_bytes,
      sha256: patch.signature_sha256,
    }),
  ]);

  return {
    patch,
    uploads: { patch: patchUpload, signature: signatureUpload },
    created: result.created,
  };
}

async function confirmUpload(id: string) {
  const patchId = z.uuid().parse(id);
  const existing = await prisma.gameReleasePatch.findUnique({
    where: { id: patchId },
  });
  if (!existing) throw patchNotFound(patchId);
  if (existing.status === GameReleasePatchStatus.READY) {
    return serialize(existing);
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const references = await validateReferences(
          tx,
          existing.target_release_id,
          existing.source_release_id,
          existing.platform,
          existing.architecture,
          true,
        );
        assertTargetArtifactBinding(existing, references.targetArtifact);
      },
      { isolationLevel: "Serializable" },
    );

    const [patchObject, signatureObject] = await Promise.all([
      storage.getPatchObjectMetadata(existing.patch_storage_object_key),
      storage.getPatchObjectMetadata(existing.signature_storage_object_key),
    ]);
    validateStoredFile(existing, "PATCH", patchObject);
    validateStoredFile(existing, "SIGNATURE", signatureObject);

    const ready = await withTransactionRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const patch = await tx.gameReleasePatch.findUnique({
            where: { id: patchId },
          });
          if (!patch) throw patchNotFound(patchId);
          if (patch.status === GameReleasePatchStatus.READY) return patch;

          const references = await validateReferences(
            tx,
            patch.target_release_id,
            patch.source_release_id,
            patch.platform,
            patch.architecture,
            true,
          );
          assertTargetArtifactBinding(patch, references.targetArtifact);
          if (!isSamePersistedPatch(existing, patch)) {
            throw new PatchIntegrityError(
              "Patch metadata changed during upload confirmation",
            );
          }

          return tx.gameReleasePatch.update({
            where: { id: patch.id },
            data: { status: GameReleasePatchStatus.READY },
          });
        },
        { isolationLevel: "Serializable" },
      ),
    );

    return serialize(ready);
  } catch (error) {
    if (error instanceof ValidationError) {
      await prisma.gameReleasePatch.updateMany({
        where: { id: patchId, status: { not: GameReleasePatchStatus.READY } },
        data: { status: GameReleasePatchStatus.FAILED },
      });
    }
    throw error;
  }
}

async function findById(id: string) {
  const patchId = z.uuid().parse(id);
  const patch = await prisma.gameReleasePatch.findUnique({
    where: { id: patchId },
  });
  if (!patch) throw patchNotFound(patchId);
  return serialize(patch);
}

async function resolveLatestUpdate(
  gameId: string,
  sourceReleaseId: string,
  platform: GamePlatform,
  architecture: GameArchitecture,
) {
  const source = await prisma.gameRelease.findUnique({
    where: { id: z.uuid().parse(sourceReleaseId) },
  });
  if (!source) {
    throw new NotFoundError({
      message: `Source release "${sourceReleaseId}" was not found.`,
      action: "Check the installed release id and try again.",
    });
  }
  if (source.game_id !== gameId) {
    throw new ValidationError({
      message: "The source release does not belong to the requested game",
      action: "Send the release id recorded for this game installation",
    });
  }

  const latest = await findLatestCompatibleAfter(
    gameId,
    source.release_number,
    platform,
    architecture,
  );
  if (!latest) return { state: "UNAVAILABLE" } as const;

  const base = {
    source: {
      id: source.id,
      version: source.version,
      release_number: source.release_number,
    },
    target: releaseSummary(latest.release, latest.artifact),
    fallback_artifact_id: latest.artifact.id,
  };

  if (source.status !== GameReleaseStatus.PUBLISHED || !source.published_at) {
    return {
      state: "FOUND",
      plan: updatePlanSchema.parse({
        ...base,
        strategy: "FULL",
        reason: "SOURCE_UNAVAILABLE",
      }),
    } as const;
  }

  const predecessor = await findPreviousCompatible(
    prisma,
    latest.release,
    platform,
    architecture,
  );
  if (!predecessor || predecessor.release.id !== source.id) {
    return {
      state: "FOUND",
      plan: updatePlanSchema.parse({
        ...base,
        strategy: "FULL",
        reason: "SOURCE_NOT_PREDECESSOR",
      }),
    } as const;
  }

  const patch = await prisma.gameReleasePatch.findUnique({
    where: {
      source_release_id_target_release_id_platform_architecture: {
        source_release_id: source.id,
        target_release_id: latest.release.id,
        platform,
        architecture,
      },
    },
  });
  if (!patch) {
    return {
      state: "FOUND",
      plan: updatePlanSchema.parse({
        ...base,
        strategy: "FULL",
        reason: "NO_PATCH",
      }),
    } as const;
  }
  if (patch.status !== GameReleasePatchStatus.READY) {
    return {
      state: "FOUND",
      plan: updatePlanSchema.parse({
        ...base,
        strategy: "FULL",
        reason: "PATCH_NOT_READY",
      }),
    } as const;
  }
  if (!hasTargetArtifactBinding(patch, latest.artifact)) {
    return {
      state: "FOUND",
      plan: updatePlanSchema.parse({
        ...base,
        strategy: "FULL",
        reason: "PATCH_NOT_READY",
      }),
    } as const;
  }

  const fullSize = latest.artifact.compressed_size_bytes!;
  if (
    patch.patch_size_bytes * BigInt(100) >
    fullSize * BigInt(PATCH_MAX_FULL_SIZE_PERCENT)
  ) {
    return {
      state: "FOUND",
      plan: updatePlanSchema.parse({
        ...base,
        strategy: "FULL",
        reason: "PATCH_EXCEEDS_SIZE_LIMIT",
      }),
    } as const;
  }

  return {
    state: "FOUND",
    plan: updatePlanSchema.parse({
      ...base,
      strategy: "PATCH",
      patch: publicPatch(patch),
    }),
  } as const;
}

async function authorizeDownload(id: string, userId: string) {
  const patchId = z.uuid().parse(id);
  const parsedUserId = z.uuid().parse(userId);
  const patch = await prisma.gameReleasePatch.findUnique({
    where: { id: patchId },
  });
  if (!patch) return { state: "MISSING" } as const;

  const [source, target] = await Promise.all([
    prisma.gameRelease.findUnique({ where: { id: patch.source_release_id } }),
    prisma.gameRelease.findUnique({ where: { id: patch.target_release_id } }),
  ]);
  if (!source || !target) return { state: "MISSING" } as const;
  if (target.status === GameReleaseStatus.RETIRED) {
    return { state: "RETIRED", release: target } as const;
  }
  if (
    source.status !== GameReleaseStatus.PUBLISHED ||
    !source.published_at ||
    target.status !== GameReleaseStatus.PUBLISHED ||
    !target.published_at ||
    patch.status !== GameReleasePatchStatus.READY
  ) {
    return { state: "UNAVAILABLE" } as const;
  }
  if (!(await library.hasItem(parsedUserId, target.game_id))) {
    return { state: "FORBIDDEN" } as const;
  }

  const fallback = await prisma.gameArtifact.findUnique({
    where: {
      release_id_platform_architecture: {
        release_id: target.id,
        platform: patch.platform,
        architecture: patch.architecture,
      },
    },
  });
  if (
    source.game_id !== target.game_id ||
    !fallback ||
    fallback.status !== GameArtifactStatus.READY ||
    fallback.archive_format !== GameArchiveFormat.ZIP ||
    !fallback.compressed_size_bytes ||
    !hasTargetArtifactBinding(patch, fallback) ||
    patch.patch_size_bytes * BigInt(100) >
      fallback.compressed_size_bytes * BigInt(PATCH_MAX_FULL_SIZE_PERCENT)
  ) {
    return { state: "UNAVAILABLE" } as const;
  }

  const predecessor = await findPreviousCompatible(
    prisma,
    target,
    patch.platform,
    patch.architecture,
  );
  if (!predecessor || predecessor.release.id !== source.id) {
    return { state: "UNAVAILABLE" } as const;
  }

  const [patchObject, signatureObject] = await Promise.all([
    storage.getPatchObjectMetadata(patch.patch_storage_object_key),
    storage.getPatchObjectMetadata(patch.signature_storage_object_key),
  ]);
  try {
    validateStoredFile(patch, "PATCH", patchObject);
    validateStoredFile(patch, "SIGNATURE", signatureObject);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new PatchIntegrityError(error.message, error);
    }
    throw error;
  }

  const [finalPatch, finalTarget, finalFallback] = await Promise.all([
    prisma.gameReleasePatch.findUnique({ where: { id: patch.id } }),
    prisma.gameRelease.findUnique({ where: { id: target.id } }),
    prisma.gameArtifact.findUnique({ where: { id: fallback.id } }),
  ]);
  if (!finalPatch || !finalTarget || !finalFallback) {
    return { state: "MISSING" } as const;
  }
  if (finalTarget.status === GameReleaseStatus.RETIRED) {
    return { state: "RETIRED", release: finalTarget } as const;
  }
  if (
    finalTarget.status !== GameReleaseStatus.PUBLISHED ||
    finalPatch.status !== GameReleasePatchStatus.READY ||
    !hasTargetArtifactBinding(finalPatch, finalFallback) ||
    !isSamePersistedPatch(patch, finalPatch)
  ) {
    return { state: "UNAVAILABLE" } as const;
  }

  const [patchSigned, signatureSigned] = await Promise.all([
    storage.getPatchDownloadAuthorization(patch.patch_storage_object_key),
    storage.getPatchDownloadAuthorization(patch.signature_storage_object_key),
  ]);
  const authorization = patchDownloadAuthorizationsSchema.parse({
    patch: {
      patch_id: patch.id,
      file: "PATCH",
      url: patchSigned.url,
      expires_at: patchSigned.expires_at,
      total_size_bytes: patch.patch_size_bytes.toString(),
      sha256: patch.patch_sha256,
      ...(patchObject?.etag ? { etag: patchObject.etag } : {}),
    },
    signature: {
      patch_id: patch.id,
      file: "SIGNATURE",
      url: signatureSigned.url,
      expires_at: signatureSigned.expires_at,
      total_size_bytes: patch.signature_size_bytes.toString(),
      sha256: patch.signature_sha256,
      ...(signatureObject?.etag ? { etag: signatureObject.etag } : {}),
    },
  });

  return { state: "AUTHORIZED", authorization } as const;
}

async function validateReferences(
  tx: Prisma.TransactionClient,
  targetReleaseId: string,
  sourceReleaseId: string,
  platform: GamePlatform,
  architecture: GameArchitecture,
  requireMutableTarget: boolean,
) {
  const [target, source] = await Promise.all([
    tx.gameRelease.findUnique({ where: { id: targetReleaseId } }),
    tx.gameRelease.findUnique({ where: { id: sourceReleaseId } }),
  ]);
  if (!target) throw releaseNotFound(targetReleaseId, "Target");
  if (!source) throw releaseNotFound(sourceReleaseId, "Source");
  if (
    requireMutableTarget &&
    target.status !== GameReleaseStatus.DRAFT &&
    target.status !== GameReleaseStatus.PROCESSING
  ) {
    throw new ValidationError({
      message: `Target release "${target.id}" is ${target.status} and patch declarations are immutable`,
      action:
        "Declare and confirm the patch before publishing the target release",
    });
  }
  if (source.status !== GameReleaseStatus.PUBLISHED || !source.published_at) {
    throw new ValidationError({
      message: "The source release must be published and available",
      action: "Use the immediately previous published compatible release",
    });
  }
  if (source.game_id !== target.game_id) {
    throw new ValidationError({
      message: "Source and target releases must belong to the same game",
      action: "Generate a patch between releases of one game",
    });
  }

  const [sourceArtifact, targetArtifact, predecessor] = await Promise.all([
    tx.gameArtifact.findUnique({
      where: {
        release_id_platform_architecture: {
          release_id: source.id,
          platform,
          architecture,
        },
      },
    }),
    tx.gameArtifact.findUnique({
      where: {
        release_id_platform_architecture: {
          release_id: target.id,
          platform,
          architecture,
        },
      },
    }),
    findPreviousCompatible(tx, target, platform, architecture),
  ]);

  if (
    !sourceArtifact ||
    sourceArtifact.status !== GameArtifactStatus.READY ||
    sourceArtifact.archive_format !== GameArchiveFormat.ZIP
  ) {
    throw new ValidationError({
      message: "The source release has no ready ZIP for the declared target",
      action: "Use a platform and architecture available in the source release",
    });
  }
  if (
    !targetArtifact ||
    targetArtifact.archive_format !== GameArchiveFormat.ZIP ||
    !targetArtifact.compressed_size_bytes ||
    !targetArtifact.sha256
  ) {
    throw new ValidationError({
      message: "The target release has no declared full ZIP fallback",
      action: "Declare the target ZIP artifact before declaring its patch",
    });
  }
  if (!predecessor || predecessor.release.id !== source.id) {
    throw new ValidationError({
      message:
        "The source release is not the immediately previous compatible release",
      action: "Generate the patch from the exact compatible predecessor",
    });
  }

  return { gameId: target.game_id, sourceArtifact, targetArtifact };
}

async function findPreviousCompatible(
  tx: Pick<Prisma.TransactionClient, "gameRelease" | "gameArtifact">,
  target: { game_id: string; release_number: number },
  platform: GamePlatform,
  architecture: GameArchitecture,
) {
  const releases = await tx.gameRelease.findMany({
    where: {
      game_id: target.game_id,
      release_number: { lt: target.release_number },
      status: GameReleaseStatus.PUBLISHED,
      published_at: { not: null },
    },
    orderBy: { release_number: "desc" },
  });
  if (releases.length === 0) return null;
  const artifacts = await tx.gameArtifact.findMany({
    where: {
      release_id: { in: releases.map((release) => release.id) },
      platform,
      architecture,
      archive_format: GameArchiveFormat.ZIP,
      status: GameArtifactStatus.READY,
      compressed_size_bytes: { not: null },
      sha256: { not: null },
    },
  });
  const byRelease = new Map(
    artifacts.map((artifact) => [artifact.release_id, artifact]),
  );
  for (const release of releases) {
    const artifact = byRelease.get(release.id);
    if (artifact) return { release, artifact };
  }
  return null;
}

async function findLatestCompatibleAfter(
  gameId: string,
  sourceReleaseNumber: number,
  platform: GamePlatform,
  architecture: GameArchitecture,
) {
  const releases = await prisma.gameRelease.findMany({
    where: {
      game_id: gameId,
      release_number: { gt: sourceReleaseNumber },
      status: GameReleaseStatus.PUBLISHED,
      published_at: { not: null },
    },
    orderBy: { release_number: "desc" },
  });
  if (releases.length === 0) return null;
  const artifacts = await prisma.gameArtifact.findMany({
    where: {
      release_id: { in: releases.map((release) => release.id) },
      platform,
      architecture,
      archive_format: GameArchiveFormat.ZIP,
      status: GameArtifactStatus.READY,
      compressed_size_bytes: { not: null },
      installed_size_bytes: { not: null },
      sha256: { not: null },
      manifest_schema_version: { not: null },
    },
  });
  const byRelease = new Map(
    artifacts.map((artifact) => [artifact.release_id, artifact]),
  );
  for (const release of releases) {
    const artifact = byRelease.get(release.id);
    if (artifact) return { release, artifact };
  }
  return null;
}

function validateStoredFile(
  patch: {
    id: string;
    patch_size_bytes: bigint;
    patch_sha256: string;
    signature_size_bytes: bigint;
    signature_sha256: string;
  },
  file: PatchFileKind,
  object: PatchObjectMetadata | null,
) {
  if (!object) {
    throw verificationError(
      patch.id,
      `${file === "PATCH" ? "Patch" : "Signature"} upload was not found in storage`,
    );
  }
  const size =
    file === "PATCH"
      ? patch.patch_size_bytes.toString()
      : patch.signature_size_bytes.toString();
  const sha256 = file === "PATCH" ? patch.patch_sha256 : patch.signature_sha256;
  const checksum = Buffer.from(sha256, "hex").toString("base64");
  const mismatches: string[] = [];
  if (object.size_bytes !== size) mismatches.push(`${file} size`);
  if (object.checksum_sha256 !== checksum) mismatches.push(`${file} SHA-256`);
  if (object.content_type !== PATCH_CONTENT_TYPES[file]) {
    mismatches.push(`${file} content type`);
  }
  if (object.metadata["patch-id"] !== patch.id) {
    mismatches.push(`${file} patch identity metadata`);
  }
  if (object.metadata["patch-file"] !== file) {
    mismatches.push(`${file} role metadata`);
  }
  if (object.metadata["declared-size-bytes"] !== size) {
    mismatches.push(`${file} declared size metadata`);
  }
  if (object.metadata.sha256 !== sha256) {
    mismatches.push(`${file} SHA-256 metadata`);
  }
  if (mismatches.length > 0) {
    throw verificationError(
      patch.id,
      `Storage verification failed for: ${mismatches.join(", ")}`,
    );
  }
}

type SerializedPatch = Omit<
  GameReleasePatch,
  "patch_size_bytes" | "signature_size_bytes" | "generation_duration_ms"
> & {
  patch_size_bytes: string;
  signature_size_bytes: string;
  generation_duration_ms: string;
};

function publicPatch(patch: GameReleasePatch | SerializedPatch) {
  return releasePatchSchema.parse({
    id: patch.id,
    source_release_id: patch.source_release_id,
    target_release_id: patch.target_release_id,
    target: {
      platform: patch.platform,
      architecture: patch.architecture,
    },
    algorithm: patch.algorithm,
    format_version: patch.format_version,
    status: patch.status,
    patch: {
      size_bytes: patch.patch_size_bytes.toString(),
      sha256: patch.patch_sha256,
    },
    signature: {
      size_bytes: patch.signature_size_bytes.toString(),
      sha256: patch.signature_sha256,
    },
    expected_installation_sha256: patch.expected_installation_sha256,
    generation_duration_ms: patch.generation_duration_ms.toString(),
    created_at: patch.created_at.toISOString(),
    updated_at: patch.updated_at.toISOString(),
  });
}

function releaseSummary(
  release: {
    id: string;
    version: string;
    release_number: number;
    published_at: Date | null;
  },
  artifact: {
    id: string;
    platform: GamePlatform;
    architecture: GameArchitecture;
    compressed_size_bytes: bigint | null;
    installed_size_bytes: bigint | null;
    sha256: string | null;
    manifest_schema_version: string | null;
  },
) {
  return {
    id: release.id,
    version: release.version,
    release_number: release.release_number,
    published_at: release.published_at?.toISOString(),
    artifact_id: artifact.id,
    target: {
      platform: artifact.platform,
      architecture: artifact.architecture,
    },
    compressed_size_bytes: artifact.compressed_size_bytes?.toString(),
    installed_size_bytes: artifact.installed_size_bytes?.toString(),
    sha256: artifact.sha256,
    manifest_schema_version: artifact.manifest_schema_version,
  };
}

function serialize(patch: GameReleasePatch): SerializedPatch {
  return {
    ...patch,
    patch_size_bytes: patch.patch_size_bytes.toString(),
    signature_size_bytes: patch.signature_size_bytes.toString(),
    generation_duration_ms: patch.generation_duration_ms.toString(),
  };
}

function isSameDeclaration(
  patch: {
    algorithm: string;
    format_version: string;
    patch_size_bytes: bigint;
    patch_sha256: string;
    signature_size_bytes: bigint;
    signature_sha256: string;
    expected_installation_sha256: string;
    generation_duration_ms: bigint;
  },
  declaration: ReleasePatchUploadRequest,
) {
  return isDeepStrictEqual(
    {
      algorithm: patch.algorithm,
      format_version: patch.format_version,
      patch: {
        size_bytes: patch.patch_size_bytes.toString(),
        sha256: patch.patch_sha256,
      },
      signature: {
        size_bytes: patch.signature_size_bytes.toString(),
        sha256: patch.signature_sha256,
      },
      expected_installation_sha256: patch.expected_installation_sha256,
      generation_duration_ms: patch.generation_duration_ms.toString(),
    },
    {
      algorithm: declaration.algorithm,
      format_version: declaration.format_version,
      patch: declaration.patch,
      signature: declaration.signature,
      expected_installation_sha256: declaration.expected_installation_sha256,
      generation_duration_ms: declaration.generation_duration_ms,
    },
  );
}

function hasTargetArtifactBinding(
  patch: {
    target_artifact_id: string;
    target_artifact_sha256: string;
  },
  artifact: { id: string; sha256: string | null },
) {
  return (
    patch.target_artifact_id === artifact.id &&
    patch.target_artifact_sha256 === artifact.sha256
  );
}

function assertTargetArtifactBinding(
  patch: {
    id: string;
    target_artifact_id: string;
    target_artifact_sha256: string;
  },
  artifact: { id: string; sha256: string | null },
) {
  if (hasTargetArtifactBinding(patch, artifact)) return;
  throw new ValidationError({
    message: `Target artifact changed after patch "${patch.id}" was declared`,
    action: "Keep the original target artifact or create a new target release",
  });
}

type PersistedPatchIdentity = Pick<
  GameReleasePatch,
  | "source_release_id"
  | "target_release_id"
  | "target_artifact_id"
  | "target_artifact_sha256"
  | "platform"
  | "architecture"
  | "algorithm"
  | "format_version"
  | "patch_storage_object_key"
  | "patch_size_bytes"
  | "patch_sha256"
  | "signature_storage_object_key"
  | "signature_size_bytes"
  | "signature_sha256"
  | "expected_installation_sha256"
>;

function isSamePersistedPatch(
  first: PersistedPatchIdentity,
  second: PersistedPatchIdentity,
) {
  return (
    first.source_release_id === second.source_release_id &&
    first.target_release_id === second.target_release_id &&
    first.target_artifact_id === second.target_artifact_id &&
    first.target_artifact_sha256 === second.target_artifact_sha256 &&
    first.platform === second.platform &&
    first.architecture === second.architecture &&
    first.algorithm === second.algorithm &&
    first.format_version === second.format_version &&
    first.patch_storage_object_key === second.patch_storage_object_key &&
    first.patch_size_bytes === second.patch_size_bytes &&
    first.patch_sha256 === second.patch_sha256 &&
    first.signature_storage_object_key ===
      second.signature_storage_object_key &&
    first.signature_size_bytes === second.signature_size_bytes &&
    first.signature_sha256 === second.signature_sha256 &&
    first.expected_installation_sha256 === second.expected_installation_sha256
  );
}

async function withTransactionRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt < 3 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }
  throw new Error("Unreachable patch transaction state");
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

function patchNotFound(id: string) {
  return new NotFoundError({
    message: `Patch "${id}" was not found.`,
    action: "Check the patch id and resolve the update plan again.",
  });
}

function releaseNotFound(id: string, role: "Source" | "Target") {
  return new NotFoundError({
    message: `${role} release "${id}" was not found.`,
    action: "Check the release references and try again.",
  });
}

function verificationError(id: string, message: string) {
  return new ValidationError({
    message,
    action: `Correct both uploads for patch "${id}", then retry confirmation`,
  });
}

const gameReleasePatch = {
  initiateUpload,
  confirmUpload,
  findById,
  resolveLatestUpdate,
  authorizeDownload,
  publicPatch,
};

export default gameReleasePatch;
