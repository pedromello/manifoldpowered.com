import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import { z } from "zod";
import { clientEventsEnabled, eventLimit } from "infra/product_event_config";
import {
  OUTBOUND_PLACEMENTS,
  type OutboundAnalytics,
  type OutboundDestination,
} from "contracts/outlet-analytics";

export const outboundAnalyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((value) => [7, 30, 90].includes(value))
    .optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  store_slug: z.string().min(1).max(255).optional(),
  game_slug: z.string().min(1).max(255).optional(),
  provider: z
    .enum([
      "steam",
      "nintendo",
      "playstation",
      "xbox",
      "amazon",
      "mercado_livre",
      "nuuvem",
    ])
    .optional(),
  kind: z.enum(["official", "storefront", "game", "gift_card"]).optional(),
  platform: z
    .enum(["steam", "nintendo", "playstation", "xbox", "legacy"])
    .optional(),
  placement: z.enum(OUTBOUND_PLACEMENTS).optional(),
});
type OutboundQuery = z.infer<typeof outboundAnalyticsQuerySchema>;

export function outboundWindow(
  query: Pick<OutboundQuery, "days" | "from" | "to">,
  now = new Date(),
) {
  const retention = Math.min(
    90,
    eventLimit("PRODUCT_EVENTS_RETENTION_DAYS", 90),
  );
  if ((query.from === undefined) !== (query.to === undefined)) {
    throw new ValidationError({ message: "Choose both start and end dates." });
  }
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(
        to.getTime() - Math.min(query.days ?? 30, retention) * 86_400_000,
      );
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to > now ||
    to.getTime() - from.getTime() > retention * 86_400_000 ||
    from.getTime() < now.getTime() - retention * 86_400_000
  ) {
    throw new ValidationError({
      message: `Choose an available period of at most ${retention} days.`,
    });
  }
  return { from, to, retention };
}

type OutboundAggregate = {
  bucket: "total" | "daily" | "destination" | "game" | "outlet";
  day: string | null;
  provider: string | null;
  kind: OutboundDestination["kind"] | null;
  platform: string | null;
  country: string | null;
  placement: string | null;
  game_id: string | null;
  store_id: string | null;
  clicks: number;
  visits: number;
  official: number;
  affiliate: number;
};

/** One bounded aggregate query shared by the scoped creator and platform reports. */
export async function outboundProductClicks(
  query: OutboundQuery,
  storeId?: string,
  now = new Date(),
): Promise<OutboundAnalytics> {
  const { from, to, retention } = outboundWindow(query, now);
  const rows = await prisma.$queryRaw<OutboundAggregate[]>`
    WITH observations AS MATERIALIZED (
      SELECT to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        e.game_id, e.store_id,
        COALESCE(e.properties->>'merchant', e.properties->>'provider', 'legacy') AS provider,
        CASE WHEN e.name = 'external_store_clicked' THEN 'official' ELSE e.properties->>'kind' END AS kind,
        CASE WHEN e.name = 'affiliate_link_clicked' AND e.properties->>'kind' = 'storefront' THEN NULL
          ELSE COALESCE(e.properties->>'platform', CASE WHEN e.name = 'external_store_clicked' THEN e.properties->>'provider' END, 'legacy') END AS platform,
        COALESCE(e.properties->>'country', 'legacy') AS country,
        COALESCE(e.properties->>'placement', 'legacy') AS placement,
        e.visit_id, e.name
      FROM product_events e
      WHERE e.name IN ('external_store_clicked', 'affiliate_link_clicked') AND e.source = 'CLIENT'
        AND e.occurred_at >= ${from} AND e.occurred_at < ${to}
        ${storeId ? Prisma.sql`AND e.store_id = ${storeId}` : Prisma.empty}
        ${query.game_slug ? Prisma.sql`AND e.game_id = (SELECT id FROM games WHERE slug = ${query.game_slug})` : Prisma.empty}
    ), filtered AS (
      SELECT * FROM observations WHERE true
        ${query.provider ? Prisma.sql`AND provider = ${query.provider}` : Prisma.empty}
        ${query.kind ? Prisma.sql`AND kind = ${query.kind}` : Prisma.empty}
        ${query.platform ? Prisma.sql`AND platform = ${query.platform}` : Prisma.empty}
        ${query.placement ? Prisma.sql`AND placement = ${query.placement}` : Prisma.empty}
    )
    SELECT CASE WHEN GROUPING(day) = 0 THEN 'daily'
      WHEN GROUPING(provider) = 0 THEN 'destination'
      WHEN GROUPING(game_id) = 0 THEN 'game'
      WHEN GROUPING(store_id) = 0 THEN 'outlet' ELSE 'total' END AS bucket,
      day, provider, kind, platform, country, placement, game_id, store_id,
      count(*)::int AS clicks, count(DISTINCT visit_id)::int AS visits,
      count(*) FILTER (WHERE name = 'external_store_clicked')::int AS official,
      count(*) FILTER (WHERE name = 'affiliate_link_clicked')::int AS affiliate
    FROM filtered
    GROUP BY GROUPING SETS ((), (day), (provider, kind, platform, country, placement), (game_id), (store_id))
  `;
  const gameIds = rows
    .filter((row) => row.bucket === "game" && row.game_id)
    .map((row) => row.game_id!);
  const storeIds = rows
    .filter((row) => row.bucket === "outlet" && row.store_id)
    .map((row) => row.store_id!);
  const [games, stores] = await Promise.all([
    prisma.game.findMany({
      where: { id: { in: gameIds } },
      select: { id: true, slug: true, title: true },
    }),
    prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, slug: true, name: true },
    }),
  ]);
  const gameMap = new Map(games.map((game) => [game.id, game]));
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const totals = rows.find((row) => row.bucket === "total");
  const descending = <T extends { clicks: number }>(values: T[]) =>
    values.sort((a, b) => b.clicks - a.clicks);
  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    collection_enabled:
      clientEventsEnabled() &&
      process.env.NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED === "true",
    retention_days: retention,
    totals: {
      clicks: totals?.clicks ?? 0,
      visits: totals?.visits ?? 0,
      official: totals?.official ?? 0,
      affiliate: totals?.affiliate ?? 0,
    },
    daily: rows
      .filter((row) => row.bucket === "daily")
      .map((row) => ({
        date: row.day!,
        clicks: row.clicks,
        official: row.official,
        affiliate: row.affiliate,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    destinations: descending(
      rows
        .filter((row) => row.bucket === "destination")
        .map((row) => ({
          provider: row.provider!,
          kind: row.kind!,
          platform: row.platform!,
          country: row.country!,
          placement: row.placement!,
          clicks: row.clicks,
          visits: row.visits,
        })),
    ),
    games: descending(
      rows
        .filter((row) => row.bucket === "game")
        .map((row) => ({
          game_id: row.game_id,
          game_slug: gameMap.get(row.game_id!)?.slug ?? null,
          game_title: gameMap.get(row.game_id!)?.title ?? null,
          clicks: row.clicks,
          official: row.official,
          affiliate: row.affiliate,
        })),
    ),
    outlets: descending(
      rows
        .filter((row) => row.bucket === "outlet")
        .map((row) => ({
          store_id: row.store_id,
          store_slug: storeMap.get(row.store_id!)?.slug ?? null,
          store_name: storeMap.get(row.store_id!)?.name ?? null,
          clicks: row.clicks,
        })),
    ),
  };
}

// Internal read-only query, also documented for the future low-code dashboard.
// Caller must choose a bounded observation window; conversion may follow for seven days.
export async function selectionProductFunnel(
  from: Date,
  to: Date,
  selectionId?: string,
) {
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > 90 * 86_400_000
  ) {
    throw new ValidationError({
      message: "Choose a period of at most 90 days",
    });
  }
  return prisma.$queryRaw<
    Array<{
      selection_id: string;
      visits: number;
      accounts: number;
      wishlisted: number;
      followed: number;
      completed: number;
    }>
  >`
    WITH observations AS (
      SELECT e.selection_id, e.store_id, e.visit_id,
        e.properties->>'published_revision_id' AS revision_id,
        COALESCE(e.user_id, CASE WHEN e.id < b.id AND e.received_at <= b.received_at THEN b.user_id END) AS actor_id,
        COALESCE(e.client_occurred_at, e.occurred_at) AS journey_at
      FROM product_events e
      LEFT JOIN product_events b ON b.event_key = 'identity:visit-bound:' || e.visit_id::text
      WHERE e.name = 'selection_viewed' AND e.source = 'CLIENT'
        AND e.occurred_at >= ${from} AND e.occurred_at < ${to}
        ${selectionId ? Prisma.sql`AND e.selection_id = ${selectionId}` : Prisma.empty}
        AND NOT EXISTS (
          SELECT 1 FROM product_events other
          WHERE other.visit_id = e.visit_id AND other.user_id IS NOT NULL
            AND other.user_id <> COALESCE(e.user_id, b.user_id)
        )
    ), interest AS (
      SELECT o.*,
        (SELECT min(w.occurred_at) FROM product_events w
         JOIN store_selection_revisions r ON r.id = o.revision_id AND r.selection_id = o.selection_id
         WHERE w.user_id = o.actor_id AND w.name = 'game_wishlisted' AND w.source = 'SERVER'
           AND w.occurred_at >= o.journey_at AND w.occurred_at < o.journey_at + interval '7 days'
           AND r.snapshot->'game_ids' ? w.game_id) AS wishlist_at,
        (SELECT min(f.occurred_at) FROM product_events f
         WHERE f.user_id = o.actor_id AND f.name = 'outlet_followed' AND f.source = 'SERVER'
           AND f.store_id = o.store_id AND f.occurred_at >= o.journey_at
           AND f.occurred_at < o.journey_at + interval '7 days') AS follow_at
      FROM observations o
    )
    SELECT selection_id,
      count(DISTINCT visit_id)::int AS visits,
      count(DISTINCT actor_id)::int AS accounts,
      count(DISTINCT actor_id) FILTER (WHERE wishlist_at IS NOT NULL)::int AS wishlisted,
      count(DISTINCT actor_id) FILTER (WHERE follow_at IS NOT NULL)::int AS followed,
      count(DISTINCT actor_id) FILTER (WHERE wishlist_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM product_events f WHERE f.user_id = interest.actor_id
          AND f.name = 'outlet_followed' AND f.source = 'SERVER' AND f.store_id = interest.store_id
          AND f.occurred_at >= wishlist_at AND f.occurred_at < journey_at + interval '7 days'
      ))::int AS completed
    FROM interest GROUP BY selection_id ORDER BY selection_id
  `;
}
