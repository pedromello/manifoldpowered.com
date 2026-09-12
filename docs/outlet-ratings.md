# Outlet ratings

Each Outlet can configure one optional rating scale. A rating belongs to that
Outlet's editorial review; it is not a shared game score or a community average.
The shared API and conversion contract lives in `contracts/outlet-rating.ts`.

## Values and review editing

| Scale        | Public value          | Stored integer          |
| ------------ | --------------------- | ----------------------- |
| `STARS`      | 0–5, in steps of 0.5  | Value × 2, from 0 to 10 |
| `NUMERIC_10` | 0–10, in steps of 0.5 | Value × 2, from 0 to 20 |
| `TIER`       | `F` through `S+`      | Ordinal from 0 to 15    |

The ascending tier order is `F`, `D-`, `D`, `D+`, `C-`, `C`, `C+`, `B-`,
`B`, `B+`, `A-`, `A`, `A+`, `S-`, `S`, `S+`. API tier strings use ASCII
`-`; the interface displays a typographic minus.

The database stores `rating_scale` and `rating_value` together, or both as
`null`. Zero and `F` are valid ratings and remain distinct from no rating.
PostgreSQL constraints enforce complete pairs, native ranges, and editorial
content. The model also checks that a review uses its Outlet's configured scale.

`PUT /api/v1/stores/[slug]/game-editorials/[gameSlug]` accepts a `rating`
such as `{"scale":"STARS","value":4.5}`. Omitting it preserves an existing
rating for older clients; `null` explicitly removes it. A review needs trimmed
body text or a rating. A headline alone is insufficient, and removing the only
rating from a textless review is rejected. Use the existing DELETE endpoint to
remove the review. Writes retain the `expected_draft_revision` concurrency check.

Public catalog and Featured responses expose `outlet_review.rating`; the
editorial detail endpoint exposes `review.rating`. Both return native public
values, or `null`, without a universal converted score.

## Changing the scale

Both rating-system endpoints require resource-scoped `update:store` permission
and send `Cache-Control: private, no-store`:

- `POST /api/v1/stores/[slug]/rating-system/preview` accepts `target_scale`,
  `expected_draft_revision`, and an optional `mapping`. It returns the source
  and target scales, validated mappings with game counts, and rated/unrated
  review totals without writing the draft.
- `PUT /api/v1/stores/[slug]/rating-system` accepts the same fields. When
  rated reviews exist, a complete confirmed mapping is required. Each source
  value must appear exactly once, even if no current review uses it. An initial
  configuration has no source mapping.

The suggested tier anchors on the 0–10 scale are:

| Tier | Anchor | Tier | Anchor |
| ---- | -----: | ---- | -----: |
| `S+` |     10 | `B-` |    6.5 |
| `S`  |    9.5 | `C+` |    5.5 |
| `S-` |      9 | `C`  |      5 |
| `A+` |    8.5 | `C-` |    4.5 |
| `A`  |      8 | `D+` |      4 |
| `A-` |    7.5 | `D`  |    3.5 |
| `B+` |    7.5 | `D-` |      3 |
| `B`  |      7 | `F`  |      0 |

Stars → numeric doubles the value. Numeric → stars halves it and rounds to
the nearest half star, with ties upward. Tier → numeric uses the anchor;
tier → stars applies that same half-star rounding to half the anchor.
Numeric/stars → tier selects the nearest anchor, choosing the lower tier on
ties, including duplicate anchors. Examples: numeric `7.5 → B+`, `6 → C+`,
`1.5 → F`, and `9.5 → 5 stars`.

Creators can edit each destination in the preview. Suggestions always start
from the current native rating, and the edited mapping applies only to that
conversion. Merging and rounding can make a round trip lossy; these anchors
never determine tier filter order.

Applying changes the scale and all rated editorials, including hidden games,
in one serializable transaction with the publication lock. Unrated reviews
stay unrated, and the draft revision increments once. Stale requests and
replays return `409` and require a fresh preview. The general Outlet PATCH
rejects `rating_scale`, so it cannot bypass conversion. Applying or cancelling
a preview does not publish the Outlet.

## Publication and filtering

Publication stores the Outlet scale and editorial ratings in its immutable
revision. It also creates `StoreRevisionGameRating` rows in the same transaction
as the snapshot and published pointer. The projection has one row per
`(revision_id, game_id)` and an index on
`(revision_id, rating_scale, rating_value, game_id)`. References remain logical,
without foreign keys. Public reads use the published revision; authorized
preview reads use the current draft. Draft changes cannot alter public badges
or filters before republication.

`GET /api/v1/stores/[slug]/search` accepts all three rating parameters together:

```text
rating_scale=STARS&rating_op=gte&rating_value=4.5
rating_scale=TIER&rating_op=eq&rating_value=S%2B
```

`eq` means exactly the native value; `gte` means at least that value in the
scale's order. Exactly `S` excludes `S-` and `S+`; `A-` ranks above `B+` even
though their suggested numeric anchors coincide. Encode `S+` as `S%2B`, for
example with `URLSearchParams`, to preserve the plus sign.

Rating constraints combine with search, tags/categories, curation, and
availability before pagination and counts. Unrated games are excluded whenever
a rating filter is active; they remain eligible without one. Featured games
remain a separate editorial selection. The storefront preserves rating
parameters through its existing search, sorting, and pagination controls.
A filter for an old scale returns `400` with
`context.code = "RATING_SCALE_MISMATCH"`; the interface offers to clear it
instead of reinterpreting the value.

## Legacy data and deployment

Migration `20260912120000_add_outlet_ratings` adds nullable scale/value columns,
the scale enum, constraints, and the publication projection. Existing Outlets
start unconfigured. Existing snapshot JSON without a `rating` property reads
as `null`; historical revisions are not rewritten or assigned inferred ratings.
No historical rating backfill is required.

Regenerate Prisma and apply the migration before serving the new application
against a database. The existing production Vercel build already runs
`prisma:generate`, `migrate:deploy`, then `build`. Preview builds generate and
compile only; their database must already have the migration. For a separately
managed deployment, use the same `npm run prisma:generate` and
`npm run migrate:deploy` scripts. No new feature grant or permission backfill is
needed: rating changes reuse `update:store`.
