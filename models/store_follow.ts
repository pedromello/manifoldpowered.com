import { prisma } from "infra/database";
import { recordDomainEvent } from "models/product_event";
import type { ProductEventContext } from "infra/product_event_context";
import storeModel from "models/store";
import { z } from "zod";

const storeSlug = z.string().trim().min(1).max(255);

export const storeFollowBodySchema = z
  .object({ store_slug: storeSlug })
  .strict();

export const storeFollowQuerySchema = z
  .object({ store_slug: storeSlug })
  .strict();

async function follow(
  userId: string,
  storeSlug: string,
  context?: ProductEventContext,
) {
  const store = await storeModel.findOnePublishedBySlug(storeSlug);

  await prisma.$transaction(async (tx) => {
    const created = await tx.storeFollow.createManyAndReturn({
      data: [{ user_id: userId, store_id: store.id }],
      skipDuplicates: true,
      select: { id: true },
    });
    if (created[0])
      await recordDomainEvent(tx, {
        name: "outlet_followed",
        relation_id: created[0].id,
        user_id: userId,
        store_id: store.id,
        context,
      });
  });
}

async function unfollow(
  userId: string,
  storeSlug: string,
  context?: ProductEventContext,
) {
  const store = await storeModel.findOnePublishedBySlug(storeSlug);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const removed = await tx.$queryRaw<Array<{ id: string }>>`
      DELETE FROM store_follows WHERE user_id = ${userId} AND store_id = ${store.id} RETURNING id
    `;
    await tx.outletNotificationSubscription.updateMany({
      where: { user_id: userId, store_id: store.id, enabled: true },
      data: { enabled: false, generation: { increment: 1 } },
    });
    await tx.$executeRaw`
      UPDATE selection_email_deliveries d SET status = 'CANCELLED'
      FROM selection_email_batches b, selection_email_events e
      WHERE d.batch_id = b.id AND d.event_id = e.id
        AND d.user_id = ${userId} AND e.store_id = ${store.id}
        AND d.status = 'PENDING' AND b.first_attempt_at IS NULL
    `;
    if (removed[0])
      await recordDomainEvent(tx, {
        name: "outlet_unfollowed",
        relation_id: removed[0].id,
        user_id: userId,
        store_id: store.id,
        context,
      });
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
