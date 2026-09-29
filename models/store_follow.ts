import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import storeModel from "models/store";
import { z } from "zod";

const storeSlug = z.string().trim().min(1).max(255);

export const storeFollowBodySchema = z
  .object({ store_slug: storeSlug })
  .strict();

export const storeFollowQuerySchema = z
  .object({ store_slug: storeSlug })
  .strict();

async function follow(userId: string, storeSlug: string) {
  const store = await storeModel.findOnePublishedBySlug(storeSlug);

  try {
    await prisma.storeFollow.create({
      data: {
        user_id: userId,
        store_id: store.id,
      },
    });
  } catch (error) {
    // A unique index is the source of truth for simultaneous requests. Prisma
    // upsert can still race when multiple transactions see no row, so treat
    // only the resulting duplicate as the successful idempotent no-op.
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }
  }
}

async function unfollow(userId: string, storeSlug: string) {
  const store = await storeModel.findOnePublishedBySlug(storeSlug);

  // deleteMany makes a repeated unfollow a successful no-op while keeping the
  // user id entirely server-derived.
  await prisma.storeFollow.deleteMany({
    where: {
      user_id: userId,
      store_id: store.id,
    },
  });
}

async function status(userId: string | undefined, storeSlug: string) {
  const store = await storeModel.findOnePublishedBySlug(storeSlug);

  if (!userId) {
    return { is_followed: false };
  }

  const relationship = await prisma.storeFollow.findUnique({
    where: {
      user_id_store_id: {
        user_id: userId,
        store_id: store.id,
      },
    },
    select: { id: true },
  });

  return { is_followed: relationship !== null };
}

async function listForUser(userId: string) {
  const relationships = await prisma.storeFollow.findMany({
    where: { user_id: userId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: { store_id: true },
  });

  if (relationships.length === 0) {
    return [];
  }

  const { stores } = await storeModel.findAllPublishedPaginated({
    page: 1,
    limit: 100_000,
  });
  const storeById = new Map(stores.map((store) => [store.id, store]));

  // Logical references can outlive their target in a no-FK schema. Never leak
  // a partial relationship; omit an orphan until maintenance removes it.
  return relationships.flatMap((relationship) => {
    const store = storeById.get(relationship.store_id);
    return store ? [store] : [];
  });
}

const storeFollow = {
  follow,
  unfollow,
  status,
  listForUser,
};

export default storeFollow;
