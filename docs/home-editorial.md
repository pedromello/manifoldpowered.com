# Homepage editorial selections

The platform homepage renders a published selection carousel, then a community
discovery rail, then the shared catalog. Outlet pages retain their existing
storefronts and game attribution. Community links to games carry the outlet slug.

## Editorial configuration

`/backoffice/home` allows administrators to choose and order up to three published
selections, including multiple selections from one outlet. Changes apply together
when saved. Clearing the list restores automatic discovery.

`GET/PUT /api/v1/backoffice/home` require `read:home:any` and `update:home:any`,
respectively. These belong to the existing admin bundle. After deployment, an
existing administrator with `update:user:features:any` can POST
`{"scope":"home_admins"}` to `/api/v1/backoffice/feature-backfill`. This mode adds
only those two capabilities to active existing administrators. It does not run
baseline, Studio or Outlet owner/member reconciliation, restore unrelated admin
capabilities, or promote ordinary users. It is idempotent and audit-logged as
`feature_backfill:home_admins`. Regular activated users and outlet collaborators
do not receive homepage permissions.

The singleton `home_editorial` row stores ordered selection IDs, an optimistic
revision and the last editor/time. PUT requires `expected_revision`; a stale
revision returns 409. The configuration write and audit record commit together.
The additive migration initializes an empty list. No production seed is required.

## Public resolution

`GET /api/v1/public/home?locale=pt-BR` returns `mode`, `selections` and `communities`.
It resolves immutable publication snapshots, current catalog membership, active or
display-only game status, regional pricing and localization for the request.
Draft copy is never used as a public fallback. The response and homepage SSR use
`private, no-store`, preserving the session, language and country context.

1. A usable manual list keeps its order and is never automatically filled.
2. With no usable manual choice, automatic discovery chooses up to three usable
   selections from different outlets, using the existing publication order and
   bounded keyset scan. An older usable selection can replace a newer unavailable
   selection from the same outlet.
3. Without usable selections, the existing game spotlight/catalog remains.

The community rail loads up to 12 published identities and up to three featured
recommendations from each outlet's published snapshot. Game identity and regional
data are batch-loaded; cards reuse the existing follow/unfollow component.

## Carousel

Multiple selections rotate every six seconds, looping from last to first.
One clock controls both the timer and the two-pixel indicator in the active
thumbnail. Hover, keyboard focus, touch gestures, hidden pages and explicit pause
preserve the remaining duration. Manual selection restarts the six-second period.
Reduced-motion preference starts the carousel paused; one item has no timer.

Thumbnails support direct selection and arrow-key navigation with focus movement.
On narrow screens, the active thumbnail stays visible by scrolling only its rail.
Horizontal swipes on the hero require a dominant horizontal gesture; the thumbnail
rail retains native scrolling. The progress decoration is hidden from accessibility
APIs. The creator signature is 44 px on desktop and 38 px on mobile.

## Validation and rollout

The PR workflow includes Production Build alongside the existing unit/integration,
CLI and lint checks. Relevant tests cover publication privacy, ordered/partial
manual resolution, automatic fallback, concurrent saves/audit, batch catalog
predicate parity, SSR context and carousel interactions.

Validate migrations in an isolated database. Production applies the additive
migration through the existing deployment build. Check `/pt-BR/store`, `/en/store`
and the administrative editor after deployment. An application rollback can keep
the additive table and saved configuration in place.
