import type { NextApiRequest } from "next";
import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ConflictError, RateLimitError, ValidationError } from "infra/errors";
import {
  eventAddressKey,
  validEventContext,
} from "infra/product_event_context";
import { eventLimit } from "infra/product_event_config";
import {
  clientEventSchema,
  EVENT_PROPERTIES_BYTES,
  type ClientProductEvent,
} from "contracts/product-events";
import { visitWasBound } from "models/product_event_identity";
import {
  affiliateSnapshotSchema,
  resolveAffiliateLinks,
  type AffiliatePlatform,
} from "contracts/outlet-affiliates";

export async function reserveEventQuota(
  req: NextApiRequest,
  cost: number,
  now = new Date(),
) {
  const context = validEventContext(req);
  const address = eventAddressKey(req);
  // Missing proxy provenance must fail closed; an arbitrary forwarded header is never trusted.
  if (!address)
    throw new ValidationError({ message: "Event collection is unavailable" });
  const window = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const buckets = [
    {
      key: "global",
      limit: eventLimit("PRODUCT_EVENTS_GLOBAL_PER_MINUTE", 2000),
    },
    {
      key: address,
      limit: eventLimit("PRODUCT_EVENTS_ADDRESS_PER_MINUTE", 600),
    },
    ...(context
      ? [
          {
            key:
              context.actor === "anonymous"
                ? "browser:" + context.anonymous_id
                : "account:" + context.actor,
            limit: eventLimit("PRODUCT_EVENTS_IDENTITY_PER_MINUTE", 120),
          },
        ]
      : []),
  ];
  const allowed = await prisma.$transaction(async (tx) => {
    for (const bucket of buckets) {
      const rows = await tx.$queryRaw<Array<{ event_count: number }>>`
        INSERT INTO product_event_ingest_buckets (bucket_key, window_start, event_count, expires_at)
        SELECT ${bucket.key}, ${window}, ${cost}::int, ${new Date(window.getTime() + 120_000)}
        WHERE ${cost}::int <= ${bucket.limit}::int
        ON CONFLICT (bucket_key, window_start) DO UPDATE
        SET event_count = product_event_ingest_buckets.event_count + EXCLUDED.event_count
        WHERE product_event_ingest_buckets.event_count + EXCLUDED.event_count <= ${bucket.limit}::int
        RETURNING event_count
      `;
      // Commit earlier reservations even when an identity/address budget denies
      // this request; otherwise repeated 429s bypass the global attempt budget.
      if (!rows.length) return false;
    }
    return true;
  });
  if (!allowed) throw new RateLimitError();
}
function invalid() {
  return new ValidationError({
    message: "Invalid product event batch",
    action: "Use the current public event contract",
  });
}
type StoreTarget = {
  id: string;
  slug: string;
  published_revision_id: string;
  affiliate_links: unknown;
};
type SelectionTarget = {
  id: string;
  store_slug: string;
  slug: string;
  revision_id: string;
  revision: number;
};
type GameTarget = {
  id: string;
  slug: string;
  has_steam: boolean;
  has_nintendo: boolean;
  has_playstation: boolean;
  has_xbox?: boolean;
  affiliate_platforms?: AffiliatePlatform[];
};

export function officialStoreAvailable(
  provider: "steam" | "nintendo" | "playstation",
  game?: Pick<GameTarget, "has_steam" | "has_nintendo" | "has_playstation">,
) {
  return Boolean(
    {
      steam: game?.has_steam,
      nintendo: game?.has_nintendo,
      playstation: game?.has_playstation,
    }[provider],
  );
}

/** Resolve destinations from public data, never from a URL supplied in telemetry. */
export function validateAffiliateClick(
  event: Extract<ClientProductEvent, { name: "affiliate_link_clicked" }>,
  store: Pick<StoreTarget, "published_revision_id" | "affiliate_links">,
  game?: GameTarget,
) {
  if (store.published_revision_id !== event.target.published_revision_id)
    throw invalid();
  const snapshot = affiliateSnapshotSchema.safeParse(store.affiliate_links);
  if (!snapshot.success) throw invalid();
  const platforms: AffiliatePlatform[] = [];
  if (game?.has_steam) platforms.push("steam");
  if (game?.has_nintendo) platforms.push("nintendo");
  if (game?.has_playstation) platforms.push("playstation");
  if (game?.has_xbox) platforms.push("xbox");
  const candidates = game
    ? resolveAffiliateLinks(snapshot.data.links, {
        id: game.id,
        slug: game.slug,
        // Affiliate gift cards are BR-only; official click availability can span regions.
        platforms: game.affiliate_platforms ?? platforms,
      })
    : snapshot.data.links.filter((link) => link.kind === "storefront");
  const link = candidates.find(
    (candidate) => candidate.id === event.target.link_id,
  );
  if (
    !link ||
    event.properties.merchant !== link.merchant ||
    event.properties.kind !== link.kind ||
    event.properties.platform !== link.platform ||
    event.properties.media_type !== link.media_type ||
    event.properties.country !== link.country ||
    (game
      ? event.properties.placement === "outlet_links" ||
        event.properties.entry_surface !== "game_page"
      : event.properties.placement !== "outlet_links" ||
        event.properties.entry_surface !== "outlet_page")
  )
    throw invalid();
  return link;
}

export async function ingestProductEvents(
  req: NextApiRequest,
  generation: string | undefined,
  raw: unknown[],
) {
  const context = validEventContext(req);
  if (
    !context ||
    generation !== context.generation ||
    (context.actor === "anonymous" && (await visitWasBound(context.visit_id)))
  )
    throw new ConflictError({
      message: "Event context changed",
      action: "Discard pending events and bootstrap a new context",
    });
  const now = new Date();
  const events: ClientProductEvent[] = raw.map((value) => {
    const result = clientEventSchema.safeParse(value);
    if (!result.success) throw invalid();
    const event = result.data;
    if (
      Buffer.byteLength(JSON.stringify(event.properties), "utf8") >
      EVENT_PROPERTIES_BYTES
    )
      throw invalid();
    if (event.client_occurred_at) {
      const time = Date.parse(event.client_occurred_at);
      if (time < now.getTime() - 300_000 || time > now.getTime() + 30_000)
        throw invalid();
    }
    return event;
  });
  const stores = [
    ...new Set(
      events.flatMap((e) =>
        "store_slug" in e.target && e.target.store_slug
          ? [e.target.store_slug]
          : [],
      ),
    ),
  ];
  const games = [
    ...new Set(
      events.flatMap((e) =>
        "game_slug" in e.target && e.target.game_slug
          ? [e.target.game_slug]
          : [],
      ),
    ),
  ];
  const selections = events.filter((e) => e.name === "selection_viewed");
  const [storeRows, gameRows, selectionRows] = await Promise.all([
    stores.length
      ? prisma.$queryRaw<StoreTarget[]>`
      SELECT s.id, s.slug, s.published_revision_id, r.affiliate_links FROM stores s
      JOIN store_revisions r ON r.id = s.published_revision_id AND r.store_id = s.id
      WHERE s.status = 'PUBLISHED' AND s.slug IN (${Prisma.join(stores)})
    `
      : [],
    games.length
      ? prisma.$queryRaw<GameTarget[]>`
      SELECT g.id, g.slug,
        ((g.steam_app_id IS NOT NULL) OR (jsonb_typeof(g.social_links->'steam_page') = 'string' AND length(g.social_links->>'steam_page') > 0)
          OR EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'steam')) AS has_steam,
        ((g.nintendo_nsuid IS NOT NULL) OR EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'nintendo')) AS has_nintendo,
        ((g.playstation_product_id IS NOT NULL) OR EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'playstation')) AS has_playstation,
        EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'xbox') AS has_xbox,
        array_remove(ARRAY[
          CASE WHEN g.steam_app_id IS NOT NULL OR
            (jsonb_typeof(g.social_links->'steam_page') = 'string' AND length(btrim(g.social_links->>'steam_page')) > 0) OR
            EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'steam' AND o.country = 'BR') THEN 'steam' END,
          CASE WHEN g.nintendo_nsuid IS NOT NULL OR
            EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'nintendo' AND o.country = 'BR') THEN 'nintendo' END,
          CASE WHEN g.playstation_product_id IS NOT NULL OR
            EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'playstation' AND o.country = 'BR') THEN 'playstation' END,
          CASE WHEN EXISTS(SELECT 1 FROM game_external_offers o WHERE o.game_id = g.id AND lower(o.provider) = 'xbox' AND o.country = 'BR') THEN 'xbox' END
        ], NULL) AS affiliate_platforms
      FROM games g WHERE g.status IN ('ACTIVE', 'ONLY_DISPLAY') AND g.slug IN (${Prisma.join(games)})
    `
      : [],
    selections.length
      ? prisma.$queryRaw<SelectionTarget[]>`
      SELECT c.id, s.slug AS store_slug, c.slug, r.id AS revision_id, r.revision
      FROM store_selections c
      JOIN stores s ON s.id = c.store_id AND s.status = 'PUBLISHED'
      JOIN store_revisions sr ON sr.id = s.published_revision_id AND sr.store_id = s.id
      JOIN store_selection_revisions r ON r.id = c.published_revision_id AND r.selection_id = c.id
      WHERE c.status = 'PUBLISHED'
        AND s.slug IN (${Prisma.join(stores)}) AND c.slug IN (${Prisma.join(selections.map((e) => e.target.selection_slug))})
    `
      : [],
  ]);
  const storeMap = new Map<string, StoreTarget>(
    storeRows.map((s: StoreTarget) => [s.slug, s] as const),
  );
  const gameMap = new Map<string, GameTarget>(
    gameRows.map((g: GameTarget) => [g.slug, g] as const),
  );
  const selectionMap = new Map<string, SelectionTarget>(
    selectionRows.map(
      (s: SelectionTarget) => [s.store_slug + "/" + s.slug, s] as const,
    ),
  );
  const data: Prisma.ProductEventCreateManyInput[] = events.map((event) => {
    const target = event.target;
    const store =
      "store_slug" in target && target.store_slug
        ? storeMap.get(target.store_slug)
        : undefined;
    const game =
      "game_slug" in target && target.game_slug
        ? gameMap.get(target.game_slug)
        : undefined;
    if (
      ("store_slug" in target && target.store_slug && !store) ||
      ("game_slug" in target && target.game_slug && !game)
    )
      throw invalid();
    const selection =
      event.name === "selection_viewed"
        ? selectionMap.get(
            event.target.store_slug + "/" + event.target.selection_slug,
          )
        : undefined;
    if (
      event.name === "selection_viewed" &&
      (!selection || selection.revision !== event.target.published_revision)
    )
      throw invalid();
    if (
      event.name === "external_store_clicked" &&
      !officialStoreAvailable(event.properties.provider, game)
    )
      throw invalid();
    if (event.name === "affiliate_link_clicked") {
      if (!store) throw invalid();
      validateAffiliateClick(event, store, game);
    }
    return {
      event_key: "client:" + event.id,
      name: event.name,
      schema_version: 1,
      source: "CLIENT",
      occurred_at: now,
      received_at: now,
      client_occurred_at: event.client_occurred_at
        ? new Date(event.client_occurred_at)
        : null,
      user_id: req.context?.user?.id ?? null,
      anonymous_id: context.anonymous_id,
      visit_id: context.visit_id,
      store_id: store?.id,
      game_id: game?.id,
      selection_id: selection?.id,
      properties: {
        ...event.properties,
        ...(event.name === "external_store_clicked"
          ? { placement: event.properties.placement ?? "legacy" }
          : {}),
        ...(event.name === "affiliate_link_clicked"
          ? {
              link_id: event.target.link_id,
              published_revision_id: event.target.published_revision_id,
            }
          : {}),
        ...(selection
          ? {
              published_revision_id: selection.revision_id,
              published_revision: selection.revision,
            }
          : {}),
      },
    };
  });
  // Validation of the entire batch happens before this single atomic INSERT.
  const inserted = await prisma.productEvent.createMany({
    data,
    skipDuplicates: true,
  });
  return {
    context,
    accepted: inserted.count,
    duplicated: data.length - inserted.count,
  };
}
