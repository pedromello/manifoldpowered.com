# Better Creators UX — delivery contract

This document is the integration contract for Sprints 0–3 on
`feat/better-creators-ux`. Each implementation branch starts from this branch
and targets it. The integration branch targets `main` only after the complete
initiative passes its final audit.

## Product boundary

The website owns creator acquisition, Outlet creation, curation, identity,
preview, publication, sharing, performance, sales, and earnings. Game release
publication, artifact upload, download, installation, and updates belong to
Manifold Desktop and must not be duplicated on the website.

An Outlet is a creator-authored editorial layer over the shared Manifold
catalog and library. Differentiation must combine:

1. **Selection** — which games, highlights, collections, and ordering.
2. **Voice** — why the creator recommends a game and related creator content.
3. **Brand** — a safe layout preset, identity, and visual tokens.

## Language and brand rules

- In Brazilian Portuguese, Manifold is masculine: **O Manifold** and
  **no Manifold**. Never use _A Manifold_ or _na Manifold_.
- User-facing copy says **Outlet**, **Seus jogos**, **Mostrar**, **Ocultar**,
  **Prévia**, and **Publicar**. Whitelist/blacklist remain implementation terms
  or advanced-mode explanations, never the primary workflow.
- New creator screens use the visual language of the Manifold home and the
  existing `CreatorWorkspaceLayout`: deliberate hierarchy, restrained
  gradients, the established purple/cream/dark palette, consistent radii,
  typography, spacing, focus states, and responsive behavior.
- Do not introduce a generic dashboard aesthetic, arbitrary gradients,
  excessive glass cards, free-form CSS, placeholder claims, or decorative
  controls without product behavior.

## Cross-cutting invariants

- Storefront SSR, localized pricing, SEO metadata, wishlist, reviews, follows,
  the global library, and the acquisition contract continue to work.
- Every Outlet game link is built through the shared helper and preserves
  `?store=<slug>` attribution.
- Bespoke storefronts remain controlled by the registry. Self-service
  `layout_preset` configuration cannot impersonate another Outlet or select a
  bespoke `theme_key`.
- A draft Outlet is visible to authorized collaborators for management and
  preview, but never appears in public discovery or as a live Outlet.
- Published state is explicit. Editing a draft must not silently replace a
  valid public version with an incomplete one.
- Creator controls never grant price control, consumer PII, payment handling,
  or unsupported claims about commissions and payouts.
- Keyboard and mobile use are first-class. Reordering and selection cannot
  depend only on drag-and-drop.

## Sprint acceptance gates

### Sprint 0 — foundation

- New Outlets start in `DRAFT`.
- Public discovery and public Outlet reads exclude drafts.
- Authorized users can manage and preview a draft.
- Publish/unpublish is explicit, authorized, validated, and covered by tests.
- Renaming an Outlet does not change its slug.
- Creator funnel events have a typed, documented seam and do not expose PII.
- Existing published Outlets are migrated without disappearing unexpectedly.

### Sprint 1 — onboarding and Overview

- The creator can resume setup and always sees one clear next action.
- The flow covers identity, initial selection strategy, highlight, preview,
  publish, and share without silently publishing the full catalog.
- The Overview shows lifecycle state and readiness truthfully.
- Loading, error, empty, success, and permission states are designed.
- A creator can complete the flow on a 390 px viewport and with a keyboard.

### Sprint 2 — visual curation

- Games are selected from visual catalog results with search and real tags.
- Bulk show/hide actions provide clear feedback and safe retry/undo behavior.
- Rule impact is shown before a tag rule is applied.
- Existing tag filters and game overrides remain available in advanced mode.
- Editorial featured recommendations are integrated rather than duplicated.
- The preview reflects the resulting curated catalog.

### Sprint 3 — identity and presets

- Three presets differ structurally, not only by palette.
- Identity supports a useful creator profile, cover, logo, and social links.
- Owner-writable values are allow-listed and validated.
- Presets preserve the storefront contract markers, SSR, empty states, and
  attributed links.
- Neon Alley and Strategos Void remain isolated and functional.
- Supplied palette combinations meet WCAG AA for essential text and controls.

## Pull request evidence

Every PR must include:

- A concise product outcome and scope.
- Its target sprint and acceptance-gate checklist.
- Tests run with command and result.
- Risks, migrations, rollout/backfill behavior, and follow-ups.
- For new or materially changed screens, desktop and mobile screenshots using
  realistic content. Screenshots must show loading/empty/error states when the
  change materially affects them.
- Confirmation that Brazilian Portuguese uses Manifold in the masculine.

## Initiative success measures

Activation is a published Outlet with complete identity, at least five selected
games, one editorial highlight, and its first link copied. The operational
north-star is the number of published Outlets that receive at least one
attributed qualified session per week.

Supporting measures: median time to publish, onboarding completion, publish
rate, share rate, first attributed visit within seven days, creator D7/D30
retention, game click-through, attributed acquisition, commission per active
Outlet, and composition diversity across Outlets.
