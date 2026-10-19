import { randomUUID } from "node:crypto";
import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import {
  enqueueSelectionEmailBatch,
  enqueueSelectionEmailEvent,
} from "infra/selection-email-queue";
import { selectionEmailsEnabled } from "lib/selection-email-config";

const PAGE_SIZE = 500;
const BATCH_SIZE = 100;
type Tx = Prisma.TransactionClient;

interface EventPage {
  id: string;
  selection_id: string;
  store_id: string;
  revision_id: string;
  occurred_at: Date;
  fanout_cursor: string | null;
}

interface Recipient {
  subscription_id: string;
  user_id: string;
  generation: number;
  email_version: number;
  recipient_email: string;
}

/** The publication caller invokes this only for revision one, in the publication transaction. */
export async function recordSelectionEmailPublication(
  tx: Tx,
  input: {
    selectionId: string;
    storeId: string;
    revisionId: string;
    occurredAt: Date;
  },
) {
  if (!selectionEmailsEnabled()) return null;
  const created = await tx.selectionEmailEvent.createManyAndReturn({
    data: [
      {
        selection_id: input.selectionId,
        store_id: input.storeId,
        revision_id: input.revisionId,
        occurred_at: input.occurredAt,
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  return created[0]?.id ?? null;
}

/** A single bounded page; cursor, deliveries, and batches either all commit or all roll back. */
async function createPage(tx: Tx, eventId: string) {
  const leaseToken = randomUUID();
  const [event] = await tx.$queryRaw<EventPage[]>`
    UPDATE selection_email_events SET status = 'FANOUT', lease_token = ${leaseToken},
      lease_until = NOW() + INTERVAL '2 minutes'
    WHERE id = (
      SELECT id FROM selection_email_events
      WHERE id = ${eventId} AND status IN ('PENDING', 'FANOUT')
        AND (lease_until IS NULL OR lease_until < NOW())
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, selection_id, store_id, revision_id, occurred_at, fanout_cursor
  `;
  if (!event)
    return { status: "NOOP", batchIds: [], hasMore: false, deliveries: 0 };

  const live = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM store_selections c
    JOIN stores s ON s.id = c.store_id
    JOIN store_revisions sr ON sr.id = s.published_revision_id AND sr.store_id = s.id
    JOIN store_selection_revisions cr ON cr.id = c.published_revision_id AND cr.selection_id = c.id
    JOIN store_selection_revisions er ON er.id = ${event.revision_id} AND er.selection_id = c.id
    WHERE c.id = ${event.selection_id} AND c.store_id = ${event.store_id}
      AND c.status = 'PUBLISHED' AND s.status = 'PUBLISHED'
  `;
  if (!live.length) {
    await tx.selectionEmailEvent.updateMany({
      where: { id: event.id, lease_token: leaseToken },
      data: { status: "CANCELLED", lease_token: null, lease_until: null },
    });
    return { status: "CANCELLED", batchIds: [], hasMore: false, deliveries: 0 };
  }

  const cursor = event.fanout_cursor
    ? Prisma.sql`AND n.id > ${event.fanout_cursor}`
    : Prisma.empty;
  const rows = await tx.$queryRaw<Recipient[]>`
    SELECT n.id AS subscription_id, n.user_id, n.generation,
           n.email_version, LOWER(BTRIM(u.email)) AS recipient_email
    FROM outlet_notification_subscriptions n
    JOIN users u ON u.id = n.user_id
    WHERE n.store_id = ${event.store_id} AND n.enabled = TRUE
      AND n.created_at <= ${event.occurred_at} AND n.enabled_at <= ${event.occurred_at}
      AND u.verified_email = LOWER(BTRIM(u.email)) AND u.email_verified_at IS NOT NULL
      AND u.email_verified_at <= ${event.occurred_at}
      AND n.consent_email = LOWER(BTRIM(u.email)) AND n.email_version = u.email_version
      AND 'create:store_follow' = ANY(u.features)
      AND EXISTS (
        SELECT 1 FROM store_follows f
        WHERE f.user_id = n.user_id AND f.store_id = n.store_id
      )
      ${cursor}
    ORDER BY n.id ASC LIMIT ${PAGE_SIZE + 1}
  `;
  const page = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;
  const created = page.length
    ? await tx.selectionEmailDelivery.createManyAndReturn({
        data: page.map((row) => ({
          event_id: event.id,
          user_id: row.user_id,
          subscription_id: row.subscription_id,
          subscription_generation: row.generation,
          email_version: row.email_version,
          recipient_email: row.recipient_email,
        })),
        skipDuplicates: true,
        select: { id: true, subscription_id: true },
      })
    : [];
  const order = new Map(page.map((row, index) => [row.subscription_id, index]));
  created.sort(
    (a, b) => order.get(a.subscription_id)! - order.get(b.subscription_id)!,
  );
  const batchIds: string[] = [];
  for (let offset = 0; offset < created.length; offset += BATCH_SIZE) {
    const batchId = randomUUID();
    await tx.selectionEmailBatch.create({
      data: {
        id: batchId,
        event_id: event.id,
        idempotency_key: `selection-email/${batchId}`,
      },
      select: { id: true },
    });
    await tx.selectionEmailDelivery.updateMany({
      where: {
        id: {
          in: created.slice(offset, offset + BATCH_SIZE).map((row) => row.id),
        },
        batch_id: null,
      },
      data: { batch_id: batchId },
    });
    batchIds.push(batchId);
  }
  await tx.selectionEmailEvent.updateMany({
    where: { id: event.id, lease_token: leaseToken },
    data: {
      status: hasMore ? "FANOUT" : "COMPLETE",
      ...(page.length
        ? { fanout_cursor: page[page.length - 1].subscription_id }
        : {}),
      lease_token: null,
      lease_until: null,
    },
  });
  return {
    status: hasMore ? "FANOUT" : "COMPLETE",
    batchIds,
    hasMore,
    deliveries: created.length,
  };
}

/** Queue payloads remain IDs; recipient snapshots stay in the protected database. */
export async function processSelectionEmailEvent(eventId: string) {
  if (!selectionEmailsEnabled()) return { status: "DISABLED", deliveries: 0 };
  const result = await prisma.$transaction((tx) => createPage(tx, eventId), {
    timeout: 20_000,
  });
  const enqueue = result.batchIds.map((id) => enqueueSelectionEmailBatch(id));
  if (result.hasMore) enqueue.push(enqueueSelectionEmailEvent(eventId));
  const published = await Promise.allSettled(enqueue);
  if (published.some((item) => item.status === "rejected")) {
    // The page already committed. Recovery scans durable prepared batches and
    // unfinished events, including a failure after committing the final page.
    throw Object.assign(new Error("Selection email dispatch is pending"), {
      retryAfterSeconds: 60,
    });
  }
  return { status: result.status, deliveries: result.deliveries };
}
