# Outlet lifecycle contract

This document defines the Sprint 0 safety boundary for creator-authored
Outlets. It complements `docs/better-creators-ux-delivery.md`; release
publication and artifact delivery remain responsibilities of Manifold Desktop.

## Baseline and compatibility

The implementation branch starts from `feat/better-creators-ux` at `c56d2fb`
and was audited against `origin/main`. Existing follow, editorial Featured,
regional-pricing, localization, and `CreatorWorkspaceLayout` behavior is reused.
The lifecycle must preserve storefront SSR and the `?store=<slug>` attribution
contract for a normal published visit.

## Draft and published revision

`Store` is the mutable working draft. A newly created Store starts in `DRAFT`
with `catalog_mode=UNDECIDED` and a numeric `draft_revision`. Every mutation to
identity, presentation, catalog mode, tag filters, per-game overrides, or
Featured recommendations increments that revision atomically. Its slug is
assigned once and never changes when the display name changes.

A public Outlet is projected from one append-only publication revision. A
revision freezes all creator-controlled public inputs together:

- identity: name, description, and logo;
- presentation: a versioned allow-listed payload for `layout_preset`,
  `palette_id`, `typography_id`, `shape_id`, `tagline`, `cover_image_url`,
  `social_links`, and the permitted `theme_key` authority;
- catalog mode and the curation rules/selections needed to reproduce it; and
- the ordered Featured games and their creator recommendation reasons.

The presentation parser/resolver is a shared typed contract. Unknown keys are
not projected, and absent Sprint 3 fields resolve to safe current-theme
defaults. A public read never combines a revision's identity with mutable Store
curation or presentation.

`PUBLISHED` means that the Store currently points to a public revision. Publish
creates a new revision and moves that pointer in one transaction. Editing the
working draft does not change the live Outlet. Republishing promotes a complete
new snapshot. Unpublish removes public visibility but preserves all revisions,
lifecycle audit events, followers, and `last_published_at`.

Existing Outlets receive an initial revision during migration and remain live.
Their initial catalog snapshot may use `LEGACY_ALL` to record the old implicit
full-catalog behavior without treating it as a new creator decision.

## Catalog modes

Draft catalog intent has three creator-selectable modes:

- `UNDECIDED`: the creator has not made a selection decision; it cannot be
  published.
- `ALL`: the creator explicitly chose the whole eligible shared catalog.
- `SELECTED`: the baseline is empty; inclusions come from explicit `SHOW`
  selections or inclusive tag rules, and exclusions can subtract from them.

The precedence matrix is shared by draft preview, readiness, and live feeds.
`HIDE` always excludes a game. A per-game `SHOW` overrides a tag blacklist.
In `ALL`, whitelist rules do not narrow the full-catalog baseline; blacklist
rules exclude matches. In `SELECTED`, an empty selection returns zero games and
whitelist rules or per-game `SHOW` choices add games.

`LEGACY_ALL` is migration-only publication history and is never offered as a
new draft choice. A blacklist by itself does not turn an undecided draft into
an intentional selection, and `SELECTED` must not be implemented by silently
starting with every game or by creating hundreds of `HIDE` records.

## Readiness version 2

The publication API returns a versioned list of structured blockers. Readiness
version 2 requires all of the following:

1. brand identity is complete under the server-owned predicate;
2. catalog mode is an intentional `ALL` or `SELECTED` decision;
3. the resulting eligible catalog contains at least five games;
4. Featured contains between one and three games;
5. every Featured game belongs to the resulting catalog; and
6. every Featured entry has a valid, trimmed recommendation reason.

Blockers use stable codes and structured facts rather than UI copy. Expected
codes include `BRAND_INCOMPLETE`, `CATALOG_MODE_UNDECIDED`,
`SELECTED_CATALOG_WITHOUT_INCLUSIONS`, `CATALOG_TOO_SMALL`,
`FEATURED_COUNT_INVALID`, `FEATURED_OUTSIDE_CATALOG`, and
`FEATURED_REASON_MISSING`. The client localizes those codes but does not
independently decide whether publication is safe.

Readiness uses a global catalog baseline: games in `ACTIVE` or `ONLY_DISPLAY`
state under the exact shared curation predicate. Request-time regional pricing
can reduce the visible `ACTIVE` subset for a currency without changing the
publication decision; `ONLY_DISPLAY` remains visible in every regional feed.

Readiness is recalculated inside the same transaction that publishes. The POST
command includes `expected_draft_revision`; a stale value returns a conflict
and cannot publish a mixed snapshot. The transaction conditionally claims the
draft revision, creates its immutable snapshot, appends an audit event with the
actor and transition, and then promotes the public pointer.

## Authorization and publication API

`GET /api/v1/stores/:slug/publication` returns state, `draft_revision`, current
published revision metadata, and readiness v2 to an authorized collaborator.

`POST /api/v1/stores/:slug/publication` accepts a strict command. Publish uses:

```json
{ "action": "publish", "expected_draft_revision": 7 }
```

Unpublish is also explicit and carries the last revision observed by the
client. Both actions require the coarse `publish:store` feature and a resource
authorization check for that Store. Owners and eligible collaborators receive
the feature; another Store's collaborator does not. Repeated or invalid
transitions fail instead of writing misleading duplicate audit events.

## Public reads and private preview

All public entry points are fail-closed. A draft has no public Outlet identity,
catalog, social card, structured data, follow target, sitemap entry, or valid
attribution target. This includes:

- Discover and `GET /api/v1/public/stores`;
- the ordinary Store endpoint and storefront SSR;
- search, Featured, trending, and new-release feeds;
- followed-Outlet lists and follow/status mutations;
- sitemap, Open Graph, and JSON-LD data; and
- library acquisition and sale attribution from a known non-public Store.

An unknown `store_slug` remains lenient for acquisition compatibility and
records no attribution. A known draft slug is different: it is rejected so a
private preview can never become an acquisition or attributed sale.

An owner or collaborator with update access can request `preview=1`. Preview
projects the complete current draft — including its draft presentation and
curation — through the same regional-pricing and SSR paths. The authorization
decision is repeated by child feed and item requests; the flag alone is never a
credential. Preview responses set `Cache-Control: private, no-store` and emit
`noindex, nofollow` at both the HTTP and document levels. Preview item pages
propagate `?store=<slug>&preview=1`, omit JSON-LD, and disable acquisition,
wishlist, and review mutations as well as attribution writes. Ordinary
published item links retain their existing behavior.

## Creator funnel analytics

Vercel Analytics is accessed through a closed, SSR-safe client adapter. Every
event includes `funnel_version=1` and an allow-listed `entry_surface`. The exact
event names are:

- `creator_outlet_create_started`
- `creator_outlet_draft_created`
- `creator_outlet_first_game_added`
- `creator_outlet_brand_complete`
- `creator_outlet_previewed`
- `creator_outlet_published`
- `creator_outlet_link_copied`

Payloads contain only allow-listed low-cardinality booleans and enums. They do
not include user, Store, or game identifiers; slugs; names; descriptions;
URLs; query strings; or error copy. Success events are emitted only after the
corresponding operation succeeds. Analytics remains best-effort; publication
audit rows are the durable lifecycle record.

## Acceptance gates

- [ ] New Outlets are mutable `DRAFT` Stores with an undecided catalog.
- [ ] Existing Outlets receive a live migration snapshot without disappearing.
- [ ] Pending identity, presentation, curation, and Featured edits cannot leak
      into the public revision.
- [ ] Publish is resource-authorized, readiness-validated, concurrency-safe,
      transactional, and audited.
- [ ] Public Store, feed, Discover, follow, SEO, sitemap, item, acquisition, and
      attribution paths all fail closed for drafts.
- [ ] Authorized preview is complete, private, noindex, and non-acquirable.
- [ ] Unpublish preserves slug, followers, history, and last publication time.
- [ ] Regional pricing, storefront SSR, and normal published attribution remain
      intact.
- [ ] The seven PII-free `creator_outlet_*` events are covered by tests.
- [ ] Brazilian Portuguese copy uses **O/no/do/pelo Manifold**, never feminine
      articles directly before Manifold.
