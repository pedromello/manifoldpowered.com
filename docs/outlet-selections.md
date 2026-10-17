# Outlet selections and the editorial homepage

Tracking: [#277](https://github.com/pedromello/manifoldpowered.com/issues/277)
and [#278](https://github.com/pedromello/manifoldpowered.com/issues/278).

## Product decision

Concept 4, **Editorial Showcase**, is the approved homepage direction. Visitors
start with a game, learn why an outlet recommends it, and can either discover
that game or explore the named selection containing it. Two secondary picks
and intent-based browsing continue discovery. The existing catalog remains
available. The outlet-first Concept 3 is reserved for a future established or
promoted creator spotlight.

![Approved Concept 4](design/concept-4-editorial-showcase.png)

The concept image is an illustrative composition. The implementation uses
actual catalog artwork, published outlet identity and real selections, without
inventing testimonials, scores, follower counts or recommendations.

## A selection is separate from the outlet catalog

An outlet can have multiple named selections, and a game can belong to more
than one. A selection has a stable address, title, description, HTTPS cover,
up to six optional gallery images and up to 100 ordered games. The games must
belong to the outlet catalog. Selection edits do not change the outlet's
whole-catalog rules or its featured recommendations.

The existing singular `/api/v1/stores/{outlet}/selection` endpoint still controls
the whole catalog. New named collections use plural `/selections` routes.

## Drafts, permissions and publication

`StoreSelection` holds the editable draft. `StoreSelectionRevision` holds an
immutable published snapshot. Changes and publication require the inspected
`expected_draft_revision`; a competing write returns 409 and is never replayed
automatically. A title-only edit preserves all other fields.

Existing scoped `update:store` permissions control editing. Scoped
`publish:store` permissions control publication and withdrawal. Both global
account features and outlet membership/ownership are checked. Private reads
are authorized, `private, no-store`, and excluded from indexing. No new
administrative privilege is introduced.

A selection needs a description, cover and at least one eligible game to
publish. Its outlet must already be published, and every selected game must
belong to that outlet's **published** catalog. Public reads resolve immutable
selection content and published outlet identity, then reapply current game
visibility, catalog eligibility, localization and regional pricing. Inactive
games disappear; an unavailable regional catalog gets an explicit empty state.

Withdrawal removes the public page, discovery, sitemap and social-preview
endpoint. Historical snapshots are retained and revision numbers never restart.
Unpublishing the parent outlet also hides its selections. Republishing the
outlet makes its still-published selections available again, subject to current
eligibility.

## HTTP routes and pages

| Route                                             | Purpose                                                       |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `GET/POST /api/v1/stores/{outlet}/selections`     | Paginated public/draft list; create draft                     |
| `GET/PATCH .../selections/{selection}`            | Public or authorized preview; edit draft                      |
| `GET/POST .../selections/{selection}/publication` | Readiness; publish or withdraw                                |
| `GET /api/v1/public/selections?limit=3`           | Homepage discovery; one latest selection per published outlet |
| `/[locale]/store/{outlet}/selections/{selection}` | Server-rendered public page                                   |
| `/api/og/selection/{outlet}/{selection}`          | Public social image                                           |

The outlet management **Selections** tab provides a draft editor, ordered game
picker, readiness, saved preview, publication, withdrawal and public sharing.
Public outlet pages display paginated selection cards. Preview links preserve
outlet attribution and preview context when navigating to games.

Public pages include canonical and language links, Open Graph/Twitter metadata,
`CollectionPage`/`ItemList` structured data and sitemap entries. Social-image
generation fetches only anonymous published content and retains the existing
bounded raster-image fetch allowlist. Arbitrary creator image hosts are never
fetched server-side for social rendering. Withdrawal stops future responses;
external social networks may retain their own cached previews.

## CLI and agents

See [the CLI guide](agent-cli.md#named-game-selections) for commands and the
repository's `tools/cli/skills/manifold-cli` skill. Text, images, membership,
ordering and lifecycle use the same HTTP APIs, validators and permissions as
the editor. Existing account/profile/session isolation still applies.

## Rollout

Apply `20261017000000_add_outlet_selections` before exercising the new routes.
Production's existing build policy applies migrations; preview builds
deliberately do not migrate shared databases. Use an isolated database to test
this schema change, or coordinate a separate schema rollout before testing a
shared preview. No data backfill or automatic publication is required.

The homepage falls back to its existing game/catalog experience when there are
no usable published selections or the discovery service is unavailable. This
allows creators to publish selections incrementally. Ranking currently means
the most recently published selection from each outlet; featured-placement
administration and personalized ranking are outside this version.

## Verification evidence

Local validation uses a disposable PostgreSQL 16 database. Five integration
scenarios cover the actual HTTP API and built CLI, including draft/public
isolation, independent selections with overlapping games, foreign-account
denial, invalid inputs, concurrent writes, immutable history, catalog changes,
inactive games, SEO HTML, social-image rendering, sitemap entries and withdrawal.

The complete unit suite and CLI suite also pass. Browser checks exercised
local OTP delivery through an SMTP capture fixture, the authenticated editor,
save-before-publish controls, public draft isolation, publication, sharing, and
1440px desktop/390px phone layouts without horizontal overflow. Fixture accounts
and content exist only in the disposable local database. These checks do not
claim production or shared-preview validation of the new schema.

Screenshots: [desktop home](screenshots/outlet-selections/home-desktop.png),
[phone home](screenshots/outlet-selections/home-mobile.png),
[desktop selection](screenshots/outlet-selections/selection-desktop.png),
[phone selection](screenshots/outlet-selections/selection-mobile.png),
[desktop editor](screenshots/outlet-selections/editor-desktop.png), and
[phone editor](screenshots/outlet-selections/editor-mobile.png).
