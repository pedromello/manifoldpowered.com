import { prisma } from "infra/database";
import { NotFoundError, ServiceError, ValidationError } from "infra/errors";
import {
  GameArchitecture,
  GamePlatform,
  GameReleaseStatus,
  Prisma,
} from "generated/prisma/client";
import { z } from "zod";
import { installManifestSchema } from "contracts/desktop/v1";

export const gameReleaseCreateSchema = z.object({
  game_id: z.uuid(),
  version: z.string().trim().min(1).max(50),
  release_notes: z.string().max(100_000).optional(),
});

export const gameReleaseUpdateSchema = gameReleaseCreateSchema
  .pick({ version: true, release_notes: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one release field must be supplied",
  });

export type GameReleaseCreateDto = z.infer<typeof gameReleaseCreateSchema>;
export type GameReleaseUpdateDto = z.infer<typeof gameReleaseUpdateSchema>;

const mutableReleaseStatuses: GameReleaseStatus[] = [
  GameReleaseStatus.DRAFT,
  GameReleaseStatus.PROCESSING,
  GameReleaseStatus.FAILED,
];

async function createDraft(input: GameReleaseCreateDto) {
  const data = gameReleaseCreateSchema.parse(input);

  // Serializable + retry makes max + 1 safe when two uploads for the same
  // game start together. The database unique key is the final guard.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const game = await tx.game.findUnique({
            where: { id: data.game_id },
            select: { id: true },
          });

          if (!game) {
            throw new NotFoundError({
              message: `Game "${data.game_id}" was not found.`,
              action: "Check the game id and try again.",
            });
          }

          const latest = await tx.gameRelease.aggregate({
            where: { game_id: data.game_id },
            _max: { release_number: true },
          });

          return tx.gameRelease.create({
            data: {
              ...data,
              release_number: (latest._max.release_number ?? 0) + 1,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt < 3 && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }

  throw new Error("Unreachable release creation state");
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function findById(id: string) {
  const release = await prisma.gameRelease.findUnique({ where: { id } });
  if (!release) throw releaseNotFound(id);
  return release;
}

async function updateDraft(id: string, input: GameReleaseUpdateDto) {
  const data = gameReleaseUpdateSchema.parse(input);
  const result = await prisma.gameRelease.updateMany({
    where: { id, status: GameReleaseStatus.DRAFT },
    data,
  });

  if (result.count === 0) {
    const release = await prisma.gameRelease.findUnique({ where: { id } });
    if (!release) throw releaseNotFound(id);
    throw immutableReleaseError(id, release.status);
  }

  return prisma.gameRelease.findUniqueOrThrow({ where: { id } });
}

async function beginProcessing(id: string) {
  return transition(id, [GameReleaseStatus.DRAFT, GameReleaseStatus.FAILED], {
    status: GameReleaseStatus.PROCESSING,
  });
}

async function markFailed(id: string) {
  return transition(id, [GameReleaseStatus.PROCESSING], {
    status: GameReleaseStatus.FAILED,
  });
}

async function publish(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const release = await tx.gameRelease.findUnique({ where: { id } });
      if (!release) throw releaseNotFound(id);
      if (release.status === GameReleaseStatus.PUBLISHED) {
        return release;
      }
      if (release.status !== GameReleaseStatus.PROCESSING) {
        throw invalidTransition(
          id,
          release.status,
          GameReleaseStatus.PUBLISHED,
        );
      }

      const [artifactCount, incompleteArtifactCount] = await Promise.all([
        tx.gameArtifact.count({ where: { release_id: id } }),
        tx.gameArtifact.count({
          where: { release_id: id, status: { not: "READY" } },
        }),
      ]);

      if (artifactCount === 0 || incompleteArtifactCount > 0) {
        throw new ValidationError({
          message: `Release "${id}" cannot be published until it has at least one artifact and every artifact is ready.`,
          action: "Finish or remove incomplete artifacts, then try again.",
        });
      }

      return tx.gameRelease.update({
        where: { id },
        data: {
          status: GameReleaseStatus.PUBLISHED,
          published_at: new Date(),
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

async function retire(id: string) {
  return transition(id, [GameReleaseStatus.PUBLISHED], {
    status: GameReleaseStatus.RETIRED,
  });
}

async function transition(
  id: string,
  from: GameReleaseStatus[],
  data: { status: GameReleaseStatus },
) {
  const result = await prisma.gameRelease.updateMany({
    where: { id, status: { in: from } },
    data,
  });

  if (result.count === 0) {
    const release = await prisma.gameRelease.findUnique({ where: { id } });
    if (!release) throw releaseNotFound(id);
    throw invalidTransition(id, release.status, data.status);
  }

  return prisma.gameRelease.findUniqueOrThrow({ where: { id } });
}

async function findLatestCompatible(
  gameId: string,
  platform: GamePlatform,
  architecture: GameArchitecture,
) {
  const batchSize = 50;
  let beforeReleaseNumber: number | undefined;

  while (true) {
    const releases = await prisma.gameRelease.findMany({
      where: {
        game_id: gameId,
        status: GameReleaseStatus.PUBLISHED,
        published_at: { not: null },
        release_number:
          beforeReleaseNumber === undefined
            ? undefined
            : { lt: beforeReleaseNumber },
      },
      orderBy: { release_number: "desc" },
      take: batchSize,
    });

    if (releases.length === 0) return null;

    const artifacts = await prisma.gameArtifact.findMany({
      where: {
        release_id: { in: releases.map((release) => release.id) },
        platform,
        architecture,
        archive_format: "ZIP",
        status: "READY",
        compressed_size_bytes: { not: null },
        installed_size_bytes: { not: null },
        sha256: { not: null },
        manifest_schema_version: { not: null },
      },
    });
    const artifactsByRelease = new Map(
      artifacts.map((artifact) => [artifact.release_id, artifact]),
    );

    for (const release of releases) {
      const artifact = artifactsByRelease.get(release.id);
      if (artifact) {
        return {
          release,
          artifact: {
            ...artifact,
            compressed_size_bytes: artifact.compressed_size_bytes!.toString(),
            installed_size_bytes: artifact.installed_size_bytes!.toString(),
          },
        };
      }
    }

    if (releases.length < batchSize) return null;
    beforeReleaseNumber = releases.at(-1)!.release_number;
  }
}

async function findPublishedManifest(
  id: string,
  schemaVersion: string,
  artifactId?: string,
) {
  const release = await prisma.gameRelease.findUnique({
    where: { id },
    select: { id: true, status: true, published_at: true },
  });
  if (release?.status === GameReleaseStatus.RETIRED) {
    return { state: "RETIRED" } as const;
  }
  if (
    !release ||
    release.status !== GameReleaseStatus.PUBLISHED ||
    !release.published_at
  ) {
    return { state: "UNAVAILABLE" } as const;
  }

  const artifacts = await prisma.gameArtifact.findMany({
    where: {
      ...(artifactId ? { id: artifactId } : {}),
      release_id: id,
      status: "READY",
      manifest_schema_version: schemaVersion,
      manifest: { not: Prisma.DbNull },
    },
    orderBy: { created_at: "asc" },
    take: 2,
  });
  const [artifact] = artifacts;
  if (!artifact) return { state: "UNAVAILABLE" } as const;
  if (artifacts.length > 1) {
    throw new ValidationError({
      message:
        "Artifact id is required when a release has multiple ready artifacts",
      action: "Provide the artifact id selected by the latest release response",
    });
  }

  const manifest = installManifestSchema.safeParse(artifact.manifest);
  if (
    !manifest.success ||
    manifest.data.release_id !== release.id ||
    manifest.data.artifact_id !== artifact.id ||
    manifest.data.schema_version !== artifact.manifest_schema_version
  ) {
    throw new ServiceError({
      message: "The published install manifest failed integrity validation",
      action: "Contact the publisher before retrying the installation",
      cause: manifest.success ? undefined : manifest.error,
    });
  }

  return { state: "FOUND", manifest: manifest.data } as const;
}

function assertReleaseMutable(release: {
  id: string;
  status: GameReleaseStatus;
}) {
  if (!mutableReleaseStatuses.includes(release.status)) {
    throw immutableReleaseError(release.id, release.status);
  }
}

function releaseNotFound(id: string) {
  return new NotFoundError({
    message: `Release "${id}" was not found.`,
    action: "Check the release id and try again.",
  });
}

function immutableReleaseError(id: string, status: GameReleaseStatus) {
  return new ValidationError({
    message: `Release "${id}" is ${status} and its distribution data is immutable.`,
    action: "Create a new release for corrected distribution data.",
  });
}

function invalidTransition(
  id: string,
  from: GameReleaseStatus,
  to: GameReleaseStatus,
) {
  return new ValidationError({
    message: `Release "${id}" cannot transition from ${from} to ${to}.`,
    action: "Use the next valid publication workflow state.",
  });
}

const gameRelease = {
  createDraft,
  findById,
  updateDraft,
  beginProcessing,
  markFailed,
  publish,
  retire,
  findLatestCompatible,
  findPublishedManifest,
  assertReleaseMutable,
};

export default gameRelease;
