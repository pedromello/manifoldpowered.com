import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type SelectionEmailBatch } from "generated/prisma/client";
import { prisma } from "infra/database";
import {
  renderSelectionEmail,
  selectionEmailSender,
  sendSelectionEmailBatch,
  SelectionEmailTransportError,
} from "infra/selection-email";
import {
  enqueueSelectionEmailBatch,
  enqueueSelectionEmailEvent,
} from "infra/selection-email-queue";
import {
  selectionEmailDailyLimit,
  selectionEmailProductionOrigin,
  selectionEmailsEnabled,
} from "lib/selection-email-config";
import { selectionEmailUnsubscribeToken } from "lib/selection-email-token";
import { selectionSnapshotSchema } from "contracts/outlet-selections";
import {
  getSnapshotCurationWhereClause,
  storeCatalogSnapshotSchema,
} from "models/store_catalog";

export { processSelectionEmailEvent } from "models/selection_email_event";

const AMBIGUITY_WINDOW_MS = 23 * 60 * 60 * 1000;
const RATE_KEY = "bulk";
const frozenSchema = z
  .object({
    delivery_ids: z.array(z.string()).min(1).max(100),
    messages: z
      .array(
        z
          .object({
            from: z.string().min(1),
            to: z.email(),
            subject: z.string(),
            html: z.string(),
            text: z.string(),
            headers: z.record(z.string(), z.string()).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) =>
      value.delivery_ids.length === value.messages.length &&
      new Set(value.delivery_ids).size === value.delivery_ids.length,
  );
type Frozen = z.infer<typeof frozenSchema>;
type Tx = Prisma.TransactionClient;
type Eligible = {
  id: string;
  recipient_email: string;
  subscription_id: string;
  subscription_generation: number;
  email_locale: string | null;
};
type Prepared = {
  status: string;
  retryAt?: Date;
  nextBatchId?: string;
  frozen?: Frozen;
  leaseToken?: string;
  idempotencyKey?: string;
  mayHaveBeenAccepted?: boolean;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function emailHash(value: string) {
  return hash(value.trim().toLowerCase());
}

function nextDay(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

function retrySeconds(at: Date) {
  return Math.max(1, Math.ceil((at.getTime() - Date.now()) / 1000));
}

async function defer(
  tx: Tx,
  batch: SelectionEmailBatch,
  leaseToken: string,
  at: Date,
) {
  const claimed = await tx.selectionEmailBatch.updateMany({
    where: { id: batch.id, lease_token: leaseToken },
    data: {
      status: "RETRY",
      next_attempt_at: at,
      lease_token: null,
      lease_until: null,
    },
  });
  if (!claimed.count) return { status: "NOOP" };
  return { status: "RETRY", retryAt: at };
}

async function terminal(
  tx: Tx,
  batch: SelectionEmailBatch,
  leaseToken: string,
  status: "FAILED" | "CANCELLED" | "QUARANTINED",
  code?: string,
) {
  const claimed = await tx.selectionEmailBatch.updateMany({
    where: { id: batch.id, lease_token: leaseToken },
    data: {
      status,
      last_error_code: code,
      ...(status === "FAILED" ? { last_error_kind: "permanent" } : {}),
      lease_token: null,
      lease_until: null,
    },
  });
  if (!claimed.count) return { status: "NOOP" };
  if (status !== "QUARANTINED") {
    await tx.selectionEmailDelivery.updateMany({
      where: { batch_id: batch.id, status: "PENDING" },
      data: { status: status === "FAILED" ? "FAILED" : "CANCELLED" },
    });
  }
  return { status };
}

async function eligibleDeliveries(tx: Tx, batch: SelectionEmailBatch) {
  // Subscription changes and email updates take this same user lock. Commit
  // the first handoff boundary before they can cancel a not-yet-started send.
  await tx.$queryRaw`
    SELECT u.id FROM users u JOIN selection_email_deliveries d ON d.user_id = u.id
    WHERE d.batch_id = ${batch.id} ORDER BY u.id FOR UPDATE OF u
  `;
  const rows = await tx.$queryRaw<Eligible[]>`
    SELECT d.id, d.recipient_email, d.subscription_id, d.subscription_generation,
           p.email_locale
    FROM selection_email_deliveries d
    JOIN selection_email_events e ON e.id = d.event_id AND e.id = ${batch.event_id}
    JOIN users u ON u.id = d.user_id
    JOIN outlet_notification_subscriptions n ON n.id = d.subscription_id
      AND n.user_id = d.user_id AND n.store_id = e.store_id
    LEFT JOIN user_notification_preferences p ON p.user_id = u.id
    WHERE d.batch_id = ${batch.id} AND d.status = 'PENDING'
      AND n.enabled = TRUE AND n.generation = d.subscription_generation
      AND n.email_version = d.email_version AND n.email_version = u.email_version
      AND lower(btrim(n.consent_email)) = d.recipient_email
      AND lower(btrim(u.email)) = d.recipient_email
      AND u.verified_email = lower(btrim(u.email)) AND u.email_verified_at IS NOT NULL
      AND n.enabled_at <= e.occurred_at AND u.email_verified_at <= e.occurred_at
      AND 'create:store_follow' = ANY(u.features)
      AND EXISTS (SELECT 1 FROM store_follows f WHERE f.user_id = u.id AND f.store_id = e.store_id)
    ORDER BY d.id
  `;
  const suppressed = await tx.selectionEmailSuppression.findMany({
    where: {
      email_hash: { in: rows.map((row) => emailHash(row.recipient_email)) },
    },
    select: { email_hash: true },
  });
  const hashes = new Set(suppressed.map((row) => row.email_hash));
  return rows.filter((row) => !hashes.has(emailHash(row.recipient_email)));
}

async function publishedContent(tx: Tx, batch: SelectionEmailBatch) {
  const event = await tx.selectionEmailEvent.findUnique({
    where: { id: batch.event_id },
  });
  if (!event) return null;
  await tx.$queryRaw`
    SELECT s.id FROM stores s JOIN store_selections c ON c.store_id = s.id
    WHERE s.id = ${event.store_id} AND c.id = ${event.selection_id}
    FOR UPDATE OF s, c
  `;
  const [outlet, selection, revision] = await Promise.all([
    tx.store.findUnique({
      where: { id: event.store_id },
      select: {
        id: true,
        slug: true,
        status: true,
        published_revision_id: true,
      },
    }),
    tx.storeSelection.findUnique({
      where: { id: event.selection_id },
      select: {
        id: true,
        store_id: true,
        slug: true,
        status: true,
        published_revision_id: true,
      },
    }),
    tx.storeSelectionRevision.findFirst({
      where: { id: event.revision_id, selection_id: event.selection_id },
      select: { snapshot: true },
    }),
  ]);
  if (
    !outlet ||
    !selection ||
    !revision ||
    selection.store_id !== outlet.id ||
    outlet.status !== "PUBLISHED" ||
    selection.status !== "PUBLISHED" ||
    !outlet.published_revision_id ||
    !selection.published_revision_id
  )
    return null;
  const [identity, current] = await Promise.all([
    tx.storeRevision.findFirst({
      where: { id: outlet.published_revision_id, store_id: outlet.id },
      select: {
        name: true,
        logo_url: true,
        catalog_mode: true,
        tag_filters: true,
        game_overrides: true,
      },
    }),
    tx.storeSelectionRevision.findFirst({
      where: {
        id: selection.published_revision_id,
        selection_id: selection.id,
      },
      select: { id: true },
    }),
  ]);
  if (!identity || !current) return null;
  const content = selectionSnapshotSchema.parse(revision.snapshot);
  const curation = await getSnapshotCurationWhereClause(
    storeCatalogSnapshotSchema.parse({
      catalog_mode: identity.catalog_mode,
      tag_filters: identity.tag_filters,
      game_overrides: identity.game_overrides,
    }),
    tx,
  );
  const eligible = await tx.game.findMany({
    where: {
      id: { in: content.game_ids },
      status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
      AND: [curation],
    },
    select: { id: true },
  });
  const eligibleIds = new Set(eligible.map((game) => game.id));
  const ids = content.game_ids.filter((id) => eligibleIds.has(id)).slice(0, 3);
  const games = await tx.game.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, slug: true, media: true },
  });
  const gameById = new Map(games.map((game) => [game.id, game]));
  return {
    outlet: {
      name: identity.name,
      slug: outlet.slug,
      logo_url: identity.logo_url,
    },
    selection: { ...content, slug: selection.slug },
    games: ids.flatMap((id) => {
      const game = gameById.get(id);
      if (!game) return [];
      const media =
        game.media &&
        typeof game.media === "object" &&
        !Array.isArray(game.media)
          ? game.media
          : {};
      return [
        {
          title: game.title,
          slug: game.slug,
          image_url: typeof media.banner === "string" ? media.banner : null,
        },
      ];
    }),
  };
}

function frozenMessages(
  content: NonNullable<Awaited<ReturnType<typeof publishedContent>>>,
  recipients: Eligible[],
): Frozen {
  const origin = selectionEmailProductionOrigin();
  const from = selectionEmailSender();
  return {
    delivery_ids: recipients.map((row) => row.id),
    messages: recipients.map((row) => {
      const locale = row.email_locale === "pt-BR" ? "pt-BR" : "en";
      const token = selectionEmailUnsubscribeToken(
        row.subscription_id,
        row.subscription_generation,
      );
      const oneClick = `${origin}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
      return {
        from,
        to: row.recipient_email,
        ...renderSelectionEmail({
          ...content,
          locale,
          publicUrl: `${origin}/${locale}/store/${encodeURIComponent(content.outlet.slug)}/selections/${encodeURIComponent(content.selection.slug)}`,
          unsubscribeUrl: `${origin}/${locale}/notifications/unsubscribe#token=${encodeURIComponent(token)}`,
          preferencesUrl: `${origin}/${locale}/settings/notifications`,
        }),
        headers: {
          "List-Unsubscribe": `<${oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    }),
  };
}

async function fork(
  tx: Tx,
  batch: SelectionEmailBatch,
  recipients: Eligible[],
  at: Date,
  frozen?: Frozen,
) {
  const id = randomUUID();
  await tx.selectionEmailBatch.create({
    data: {
      id,
      event_id: batch.event_id,
      idempotency_key: `selection-email/${id}`,
      next_attempt_at: at,
      ...(frozen
        ? {
            payload: frozen as Prisma.InputJsonValue,
            payload_hash: hash(JSON.stringify(frozen)),
          }
        : {}),
    },
  });
  await tx.selectionEmailDelivery.updateMany({
    where: {
      batch_id: batch.id,
      id: { in: recipients.map((row) => row.id) },
      status: "PENDING",
    },
    data: { batch_id: id },
  });
  return id;
}

async function prepare(tx: Tx, batchId: string): Promise<Prepared> {
  const leaseToken = randomUUID();
  const [batch] = await tx.$queryRaw<SelectionEmailBatch[]>`
    UPDATE selection_email_batches SET lease_token = ${leaseToken}, lease_until = NOW() + INTERVAL '2 minutes'
    WHERE id = (SELECT id FROM selection_email_batches WHERE id = ${batchId}
      AND status IN ('PREPARED', 'IN_FLIGHT', 'RETRY') AND next_attempt_at <= NOW()
      AND (lease_until IS NULL OR lease_until < NOW()) FOR UPDATE SKIP LOCKED)
    RETURNING *
  `;
  if (!batch) {
    const existing = await tx.selectionEmailBatch.findUnique({
      where: { id: batchId },
      select: { status: true, lease_until: true, next_attempt_at: true },
    });
    if (
      !existing ||
      !["PREPARED", "IN_FLIGHT", "RETRY"].includes(existing.status)
    )
      return { status: "NOOP" };
    return {
      status: "RETRY",
      retryAt: new Date(
        Math.max(
          Date.now() + 1000,
          existing.next_attempt_at.getTime(),
          existing.lease_until?.getTime() ?? 0,
        ),
      ),
    };
  }
  const now = new Date();
  const mayHaveBeenAccepted = Boolean(
    batch.first_attempt_at && batch.last_error_kind !== "retryable",
  );
  if (
    mayHaveBeenAccepted &&
    now.getTime() - batch.first_attempt_at!.getTime() >= AMBIGUITY_WINDOW_MS
  )
    return terminal(
      tx,
      batch,
      leaseToken,
      "QUARANTINED",
      "idempotency_window_expired",
    );

  let frozen: Frozen | undefined;
  if (batch.payload !== null) {
    const parsed = frozenSchema.safeParse(batch.payload);
    if (
      !parsed.success ||
      hash(JSON.stringify(parsed.data)) !== batch.payload_hash
    )
      return terminal(
        tx,
        batch,
        leaseToken,
        "FAILED",
        "frozen_payload_invalid",
      );
    frozen = parsed.data;
  }
  let nextBatchId: string | undefined;
  if (!mayHaveBeenAccepted) {
    const content = await publishedContent(tx, batch);
    if (!content)
      return terminal(
        tx,
        batch,
        leaseToken,
        "CANCELLED",
        "publication_withdrawn",
      );
    let recipients = await eligibleDeliveries(tx, batch);
    if (!recipients.length)
      return terminal(
        tx,
        batch,
        leaseToken,
        "CANCELLED",
        "no_eligible_recipients",
      );
    await tx.selectionEmailDelivery.updateMany({
      where: {
        batch_id: batch.id,
        status: "PENDING",
        id: { notIn: recipients.map((row) => row.id) },
      },
      data: { status: "CANCELLED" },
    });
    if (frozen) {
      const eligibleIds = new Set(recipients.map((row) => row.id));
      const sameMembership =
        frozen.delivery_ids.length === recipients.length &&
        frozen.delivery_ids.every((id) => eligibleIds.has(id));
      const keyExpired =
        batch.first_attempt_at &&
        now.getTime() - batch.first_attempt_at.getTime() >= AMBIGUITY_WINDOW_MS;
      if (!sameMembership || keyExpired) {
        const indices = frozen.delivery_ids.flatMap((id, index) =>
          eligibleIds.has(id) ? [index] : [],
        );
        const replacement: Frozen = {
          delivery_ids: indices.map((index) => frozen!.delivery_ids[index]),
          messages: indices.map((index) => frozen!.messages[index]),
        };
        if (!replacement.delivery_ids.length)
          return terminal(
            tx,
            batch,
            leaseToken,
            "CANCELLED",
            "no_eligible_recipients",
          );
        nextBatchId = await fork(tx, batch, recipients, now, replacement);
        await terminal(
          tx,
          batch,
          leaseToken,
          "CANCELLED",
          "known_nonacceptance_rebuilt",
        );
        return { status: "CANCELLED", nextBatchId };
      }
    } else {
      const key = now.toISOString().slice(0, 10);
      await tx.selectionEmailDailyBudget.upsert({
        where: { key },
        create: { key },
        update: {},
      });
      const [budget] = await tx.$queryRaw<
        Array<{ reserved: number }>
      >`SELECT reserved FROM selection_email_daily_budgets WHERE key = ${key} FOR UPDATE`;
      const available = Math.max(
        0,
        selectionEmailDailyLimit() - budget.reserved,
      );
      if (!available) return defer(tx, batch, leaseToken, nextDay(now));
      if (available < recipients.length) {
        nextBatchId = await fork(
          tx,
          batch,
          recipients.slice(available),
          nextDay(now),
        );
        recipients = recipients.slice(0, available);
      }
      frozen = frozenMessages(content, recipients);
      await tx.selectionEmailDailyBudget.update({
        where: { key },
        data: { reserved: { increment: recipients.length } },
      });
      await tx.selectionEmailBatch.update({
        where: { id: batch.id },
        data: {
          payload: frozen as Prisma.InputJsonValue,
          payload_hash: hash(JSON.stringify(frozen)),
        },
      });
    }
  }
  if (!frozen)
    return terminal(tx, batch, leaseToken, "FAILED", "frozen_payload_missing");

  await tx.selectionEmailRateLimit.upsert({
    where: { key: RATE_KEY },
    create: { key: RATE_KEY },
    update: {},
  });
  const [rate] = await tx.$queryRaw<
    Array<{ next_at: Date }>
  >`SELECT next_at FROM selection_email_rate_limits WHERE key = ${RATE_KEY} FOR UPDATE`;
  const [{ now: handoffAt }] = await tx.$queryRaw<
    Array<{ now: Date }>
  >`SELECT clock_timestamp() AS now`;
  if (rate.next_at > handoffAt)
    return {
      ...(await defer(tx, batch, leaseToken, rate.next_at)),
      nextBatchId,
    };
  await tx.selectionEmailRateLimit.update({
    where: { key: RATE_KEY },
    data: { next_at: new Date(handoffAt.getTime() + 1000) },
  });
  await tx.selectionEmailBatch.update({
    where: { id: batch.id },
    data: {
      status: "IN_FLIGHT",
      first_attempt_at: batch.first_attempt_at ?? handoffAt,
      attempts: { increment: 1 },
      last_error_kind: "uncertain",
    },
  });
  return {
    status: "IN_FLIGHT",
    frozen,
    leaseToken,
    mayHaveBeenAccepted,
    nextBatchId,
    idempotencyKey: batch.idempotency_key,
  };
}

async function enqueueBatch(id: string, at?: Date) {
  try {
    await enqueueSelectionEmailBatch(id, at ? retrySeconds(at) : 0);
  } catch {
    throw Object.assign(new Error("Selection email dispatch is pending"), {
      retryAfterSeconds: at ? retrySeconds(at) : 60,
    });
  }
}

async function enqueueSplit(id?: string) {
  if (!id) return;
  try {
    const next = await prisma.selectionEmailBatch.findUnique({
      where: { id },
      select: { next_attempt_at: true },
    });
    await enqueueBatch(id, next?.next_attempt_at);
  } catch {
    console.info(
      JSON.stringify({
        component: "selection_email_dispatch",
        outcome: "recovery_pending",
        batches: 1,
      }),
    );
  }
}

/** A leased, frozen request is committed before provider I/O; no database transaction spans HTTP. */
export async function processSelectionEmailBatch(batchId: string) {
  if (!selectionEmailsEnabled()) return { status: "DISABLED" };
  const prepared = await prisma.$transaction((tx) => prepare(tx, batchId), {
    timeout: 20_000,
  });
  if (prepared.retryAt) {
    await enqueueSplit(prepared.nextBatchId);
    await enqueueBatch(batchId, prepared.retryAt);
    return { status: prepared.status };
  }
  if (!prepared.frozen || !prepared.leaseToken) {
    await enqueueSplit(prepared.nextBatchId);
    return { status: prepared.status };
  }
  const frozen = prepared.frozen;
  try {
    const accepted = await sendSelectionEmailBatch(
      frozen.messages,
      prepared.idempotencyKey!,
    );
    if (
      accepted.length !== frozen.delivery_ids.length ||
      accepted.some((row) => !row.id || row.id.length > 128) ||
      new Set(accepted.map((row) => row.id)).size !== accepted.length
    )
      throw new SelectionEmailTransportError(
        "uncertain",
        60,
        "invalid_provider_mapping",
      );
    const mapped = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.selectionEmailBatch.updateMany({
          where: { id: batchId, lease_token: prepared.leaseToken },
          data: {
            status: "ACCEPTED",
            last_error_kind: null,
            last_error_code: null,
            lease_token: null,
            lease_until: null,
          },
        });
        if (!claimed.count) return false;
        const mapping = frozen.delivery_ids.map(
          (id, index) => Prisma.sql`(${id}, ${accepted[index].id})`,
        );
        const mapped = await tx.$executeRaw`
        UPDATE selection_email_deliveries d
        SET status = 'ACCEPTED', provider_id = m.provider_id
        FROM (VALUES ${Prisma.join(mapping)}) AS m(delivery_id, provider_id)
        WHERE d.id = m.delivery_id AND d.batch_id = ${batchId} AND d.status = 'PENDING'
      `;
        if (mapped !== frozen.delivery_ids.length)
          throw new Error("Selection email mapping is incomplete");
        return true;
      },
      { timeout: 20_000 },
    );
    if (mapped) {
      try {
        await reconcileWebhooks(accepted.map((row) => row.id));
      } catch {
        // Acceptance is already durable. Preserve its outcome while leaving
        // the independently durable inbox available to recovery.
        console.info(
          JSON.stringify({
            component: "selection_email_webhooks",
            outcome: "recovery_pending",
          }),
        );
      }
    }
    return {
      status: mapped ? "ACCEPTED" : "NOOP",
      accepted: mapped ? accepted.length : 0,
    };
  } catch (error) {
    const failure =
      error instanceof SelectionEmailTransportError
        ? error
        : new SelectionEmailTransportError(
            "uncertain",
            60,
            "processing_failed",
          );
    const retryAt = new Date(
      Date.now() +
        Math.max(1, Math.min(86_400, failure.retryAfterSeconds)) * 1000,
    );
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.selectionEmailBatch.findUnique({
        where: { id: batchId },
      });
      if (!current || current.lease_token !== prepared.leaseToken)
        return "NOOP";
      if (failure.kind === "permanent") {
        await terminal(
          tx,
          current,
          prepared.leaseToken!,
          prepared.mayHaveBeenAccepted ? "QUARANTINED" : "FAILED",
          failure.code,
        );
        return prepared.mayHaveBeenAccepted ? "QUARANTINED" : "FAILED";
      }
      const kind =
        prepared.mayHaveBeenAccepted || failure.kind === "uncertain"
          ? "uncertain"
          : "retryable";
      const claimed = await tx.selectionEmailBatch.updateMany({
        where: { id: batchId, lease_token: prepared.leaseToken },
        data: {
          status: "RETRY",
          next_attempt_at: retryAt,
          last_error_kind: kind,
          last_error_code: failure.code,
          lease_token: null,
          lease_until: null,
        },
      });
      if (!claimed.count) return "NOOP";
      if (failure.kind === "retryable") {
        await tx.selectionEmailRateLimit.upsert({
          where: { key: RATE_KEY },
          create: { key: RATE_KEY, next_at: retryAt },
          update: {},
        });
        await tx.$executeRaw`UPDATE selection_email_rate_limits SET next_at = GREATEST(next_at, ${retryAt}) WHERE key = ${RATE_KEY}`;
      }
      return "RETRY";
    });
    if (outcome === "RETRY") await enqueueBatch(batchId, retryAt);
    return { status: outcome };
  } finally {
    // Queue I/O cannot delay or prevent the current provider handoff.
    await enqueueSplit(prepared.nextBatchId);
  }
}

const webhookSchema = z
  .object({
    type: z.string(),
    created_at: z.string(),
    data: z
      .object({
        email_id: z.string().min(1).max(128),
        bounce: z.object({ type: z.string().optional() }).optional(),
      })
      .passthrough(),
  })
  .passthrough();
const severity: Record<string, number> = {
  PENDING: 0,
  ACCEPTED: 1,
  DELIVERED: 2,
  CANCELLED: 3,
  FAILED: 3,
  BOUNCED: 4,
  COMPLAINED: 5,
};

async function applyWebhook(tx: Tx, id: string) {
  const [inbox] = await tx.$queryRaw<
    Array<{ id: string; provider_id: string; kind: string }>
  >`SELECT id, provider_id, kind FROM selection_email_webhooks WHERE id = ${id} AND processed = FALSE FOR UPDATE SKIP LOCKED`;
  if (!inbox) return false;
  const delivery = await tx.selectionEmailDelivery.findUnique({
    where: { provider_id: inbox.provider_id },
  });
  if (!delivery) return false;
  await tx.$queryRaw`SELECT id FROM selection_email_deliveries WHERE id = ${delivery.id} FOR UPDATE`;
  const current = await tx.selectionEmailDelivery.findUniqueOrThrow({
    where: { id: delivery.id },
  });
  const status = inbox.kind === "HARD_BOUNCED" ? "BOUNCED" : inbox.kind;
  if ((severity[status] ?? -1) > (severity[current.status] ?? -1))
    await tx.selectionEmailDelivery.update({
      where: { id: delivery.id },
      data: { status },
    });
  if (inbox.kind === "HARD_BOUNCED" || inbox.kind === "COMPLAINED") {
    await tx.selectionEmailSuppression.upsert({
      where: { email_hash: emailHash(delivery.recipient_email) },
      create: {
        email_hash: emailHash(delivery.recipient_email),
        reason: inbox.kind,
      },
      update: { reason: inbox.kind },
    });
  }
  await tx.selectionEmailWebhook.update({
    where: { id },
    data: { processed: true },
  });
  return true;
}

async function reconcileWebhooks(providerIds?: string[]) {
  const filter = providerIds
    ? Prisma.sql`AND w.provider_id IN (${Prisma.join(providerIds)})`
    : Prisma.empty;
  const pending = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT w.id FROM selection_email_webhooks w
    JOIN selection_email_deliveries d ON d.provider_id = w.provider_id
    WHERE w.processed = FALSE ${filter}
    ORDER BY CASE w.kind WHEN 'COMPLAINED' THEN 0 WHEN 'HARD_BOUNCED' THEN 1
      WHEN 'BOUNCED' THEN 2 WHEN 'FAILED' THEN 3 ELSE 4 END, w.created_at, w.id LIMIT 100
  `;
  let processed = 0;
  for (const row of pending)
    if (await prisma.$transaction((tx) => applyWebhook(tx, row.id)))
      processed++;
  return processed;
}

/** The HTTP boundary verifies the raw signature; only bounded delivery metadata is retained. */
export async function handleSelectionEmailWebhook(
  event: unknown,
  webhookId: string,
) {
  const parsed = webhookSchema.safeParse(event);
  if (!parsed.success || !webhookId || webhookId.length > 200)
    return { status: "IGNORED" };
  const occurredAt = new Date(parsed.data.created_at);
  if (!Number.isFinite(occurredAt.getTime())) return { status: "IGNORED" };
  const kinds: Record<string, string> = {
    "email.delivered": "DELIVERED",
    "email.bounced": "BOUNCED",
    "email.complained": "COMPLAINED",
    "email.failed": "FAILED",
    "email.suppressed": "FAILED",
  };
  let kind = kinds[parsed.data.type];
  if (!kind) return { status: "IGNORED" };
  if (
    kind === "BOUNCED" &&
    /^(permanent|hard)$/i.test(parsed.data.data.bounce?.type ?? "")
  )
    kind = "HARD_BOUNCED";
  await prisma.selectionEmailWebhook.createMany({
    data: [
      {
        id: webhookId,
        provider_id: parsed.data.data.email_id,
        kind,
        occurred_at: occurredAt,
      },
    ],
    skipDuplicates: true,
  });
  const processed = await prisma.$transaction((tx) =>
    applyWebhook(tx, webhookId),
  );
  return { status: processed ? "PROCESSED" : "PENDING" };
}

/** Daily repair is bounded; durable rows retain work beyond queue retention. */
export async function recoverSelectionEmails() {
  if (!selectionEmailsEnabled())
    return { status: "DISABLED", events: 0, batches: 0, webhooks: 0 };
  const now = new Date();
  const [events, batches] = await Promise.all([
    prisma.selectionEmailEvent.findMany({
      where: {
        status: { in: ["PENDING", "FANOUT"] },
        OR: [{ lease_until: null }, { lease_until: { lt: now } }],
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: 50,
      select: { id: true },
    }),
    prisma.selectionEmailBatch.findMany({
      where: {
        status: { in: ["PREPARED", "IN_FLIGHT", "RETRY"] },
        next_attempt_at: { lte: now },
        OR: [{ lease_until: null }, { lease_until: { lt: now } }],
      },
      orderBy: [{ next_attempt_at: "asc" }, { id: "asc" }],
      take: 50,
      select: { id: true },
    }),
  ]);
  const results = await Promise.allSettled([
    ...events.map((row) => enqueueSelectionEmailEvent(row.id)),
    ...batches.map((row) => enqueueSelectionEmailBatch(row.id)),
  ]);
  const webhooks = await reconcileWebhooks();
  const result = {
    status: "RECOVERED",
    events: events.length,
    batches: batches.length,
    webhooks,
    dispatch_failures: results.filter((row) => row.status === "rejected")
      .length,
    capped: events.length === 50 || batches.length === 50 || webhooks === 100,
  };
  console.info(
    JSON.stringify({ component: "selection_email_recovery", ...result }),
  );
  return result;
}
