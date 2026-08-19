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
import { z } from "zod";

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

export type GameArtifactCreateDto = z.infer<typeof gameArtifactCreateSchema>;
export type GameArtifactReadyDto = z.infer<typeof gameArtifactReadySchema>;

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
  createPending,
  findById,
  markVerifying,
  markFailed,
  markReady,
};

export default gameArtifact;
