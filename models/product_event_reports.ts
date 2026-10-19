import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";

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
