import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ConflictError, NotFoundError } from "infra/errors";
import { z } from "zod";

export const MAX_EDITORIAL_HEADLINE_LENGTH = 120;
export const MAX_EDITORIAL_BODY_LENGTH = 2000;

export const storeGameEditorialInputSchema = z
  .object({
    headline: z
      .string()
      .trim()
      .max(MAX_EDITORIAL_HEADLINE_LENGTH)
      .nullish()
      .transform((value) => value || null),
    body: z.string().trim().min(1).max(MAX_EDITORIAL_BODY_LENGTH),
    expected_draft_revision: z.number().int().min(1),
  })
  .strict();

export const storeGameEditorialDeleteSchema = z
  .object({ expected_draft_revision: z.number().int().min(1) })
  .strict();

export type StoreGameEditorialSnapshotEntry = {
  game_id: string;
  headline: string | null;
  body: string;
};

function editorialConflict(expected: number, actual: number) {
  return new ConflictError({
    message: "The Outlet draft changed before the review was saved.",
    action: "Refresh the catalog, review the latest draft, and try again.",
    context: {
      expected_draft_revision: expected,
      actual_draft_revision: actual,
    },
  });
}

async function resolveGameId(
  gameSlug: string,
  transaction: Prisma.TransactionClient,
) {
  const game = await transaction.game.findUnique({
    where: { slug: gameSlug },
    select: { id: true },
  });
  if (!game) {
    throw new NotFoundError({
      message: "Game not found.",
      action: "Check the game slug and try again.",
    });
  }
  return game.id;
}

async function advanceDraft(
  storeId: string,
  expectedDraftRevision: number,
  transaction: Prisma.TransactionClient,
) {
  const updated = await transaction.store.updateMany({
    where: { id: storeId, draft_revision: expectedDraftRevision },
    data: { draft_revision: { increment: 1 } },
  });
  if (updated.count !== 1) {
    const latest = await transaction.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { draft_revision: true },
    });
    throw editorialConflict(expectedDraftRevision, latest.draft_revision);
  }
}

async function upsert(
  storeId: string,
  gameSlug: string,
  input: z.infer<typeof storeGameEditorialInputSchema>,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const gameId = await resolveGameId(gameSlug, transaction);
        await advanceDraft(storeId, input.expected_draft_revision, transaction);
        const review = await transaction.storeGameEditorial.upsert({
          where: { store_id_game_id: { store_id: storeId, game_id: gameId } },
          create: {
            store_id: storeId,
            game_id: gameId,
            headline: input.headline,
            body: input.body,
          },
          update: { headline: input.headline, body: input.body },
        });
        return { review, draft_revision: input.expected_draft_revision + 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    return mapEditorialConflict(error, storeId, input.expected_draft_revision);
  }
}

async function remove(
  storeId: string,
  gameSlug: string,
  expectedDraftRevision: number,
) {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const gameId = await resolveGameId(gameSlug, transaction);
        await advanceDraft(storeId, expectedDraftRevision, transaction);
        await transaction.storeGameEditorial.deleteMany({
          where: { store_id: storeId, game_id: gameId },
        });
        return { draft_revision: expectedDraftRevision + 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    return mapEditorialConflict(error, storeId, expectedDraftRevision);
  }
}

async function mapEditorialConflict(
  error: unknown,
  storeId: string,
  expectedDraftRevision: number,
): Promise<never> {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    const latest = await prisma.store.findUnique({
      where: { id: storeId },
      select: { draft_revision: true },
    });
    throw editorialConflict(
      expectedDraftRevision,
      latest?.draft_revision ?? expectedDraftRevision,
    );
  }
  throw error;
}

async function findDraftByStoreAndGameIds(storeId: string, gameIds: string[]) {
  if (gameIds.length === 0) return [];
  return prisma.storeGameEditorial.findMany({
    where: { store_id: storeId, game_id: { in: gameIds } },
    select: { game_id: true, headline: true, body: true },
  });
}

function mapForStorefront(
  source: Array<{
    game_id: string;
    headline?: string | null;
    body: string;
  }>,
) {
  return new Map(
    source.map((review) => [
      review.game_id,
      { ...review, headline: review.headline ?? null },
    ]),
  );
}

const storeGameEditorial = {
  upsert,
  remove,
  findDraftByStoreAndGameIds,
  mapForStorefront,
};

export default storeGameEditorial;
