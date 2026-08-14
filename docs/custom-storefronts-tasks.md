# Custom Storefronts — Task Checklist

Tracks delivery of the per-outlet storefront design described in [`custom-storefronts.md`](./custom-storefronts.md). This file is the source of truth for "what's done / what's next" if the work is picked up mid-sequence.

Phase 1 is behaviour-preserving refactor; the theming machinery starts at 9. Every item landed with the full suite in the same state as `main`.

## Phase 1 — Refactor

- [x] **1. Shared API types** — `GameApi` moves out of `components/store/GameListItem.tsx` into `components/store/types.ts` alongside a new `StoreApi`; the six unrelated importers are repointed.
- [x] **2. Storefront controller** — `components/storefront/useStorefrontController.ts` owns the data and URL state; `Storefront.tsx` consumes it. The hook is the union of what `Storefront` did and what `pages/search` did, which is why `page`, `order` and `min_price` finally have a client. _Depends on 1._
- [x] **3. Split the default view** — `components/storefront/default/{DefaultStorefront,HeroBento,CategoryPills,StorefrontSearchBox,GameList}.tsx`, plus the `data-storefront` markers. `HeroBento` no longer returns null below three featured games. _Depends on 2._
- [x] **4. Server-render the outlet page** — `getServerSideProps` in `pages/store/[slug].tsx`, forwarding `cookie` and `x-vercel-ip-country`; real 404s and real OG tags. _Depends on 3._
- [x] **5–6. Item controller and view split** — `useItemController.ts` plus `components/storefront/default/item/`; the 863-line page drops to ~90 lines of routing. `.markdown-content` moves to `app/global.css`. _Depends on 1._
- [x] **7. Outlet context survives the click** — `lib/store-context.ts`; the item page resolves `?store=` server-side; `StoreTopNav`'s autocomplete and "View all results" stop dropping attribution; the item page forwards the country header. _Depends on 4, 5._
- [x] **8. Dead code** — `lib/games.ts` (~300 lines of unused mock catalogue) deleted; `CATEGORIES` moves to `lib/categories.ts`. _Depends on 3._

## Phase 2 — Theming

- [x] **9–11. Palette, shell, guard, registry, authoring kit** — `@theme static` tokens in `app/global.css`; `components/storefront/{palette,StorefrontShell,StorefrontContractGuard}.tsx`; `storefronts/registry.ts` with `resolveStorefront`; `storefronts/_template/`; this doc pair. The three `!important` body-background blocks are retired. _Depends on 4, 6._
- [x] **12. Item theming seam** — `ItemPage` on the registry entry, wired into `pages/item/[slug].tsx`, so an outlet's palette survives the click even when it has no bespoke product page. _Depends on 7, 9._
- [x] **13. First real custom outlet** — Neon Alley. Landed as one directory plus one registry line, as required. Building it surfaced two defects in the shared layer, both fixed in the same change: `StoreTopNav`/`StoreFooter` hardcoded `#1D0F3B` so the chrome did not follow the outlet, and `@theme static` is silently dropped by Tailwind 4.2.2 so no `sf-` utility was ever generated.

## Explicitly deferred — do not build yet

- DB-backed `theme_key`. The registry map is a one-line change away when it is needed; see the last section of `custom-storefronts.md` for the full checklist, including the `filterOutput` trap.
- An owner-facing theme picker in `/store/[slug]/manage`. Themes are hand-built, so there is nothing for an owner to pick yet.
- Store-scoped `/search`. The outlet page already serves its own search; `/search` stays global.
- Store curation applied to `GET /api/v1/items/games/[slug]`. An outlet can blacklist a tag and still render that game under its branding via a hand-typed URL. Pre-existing and cosmetic.
- A Playwright conformance spec parameterised over the registry. Chromium is available, but adding the stack is a separate decision; the contract guard covers the same ground in development.

## Known issues found during this work, not fixed here

- **`game.update()` silently clears `tags`.** `models/game.ts` parses the payload through `gameSchema…partial()`, and `.partial()` does not strip a Zod `.default()`. `tags` still carries `.default([])`, so `PATCH /api/v1/items/games/[slug]` with any body that omits `tags` wipes them — dropping the game out of every category browse and out of every outlet whose curation whitelist matches on tags. `media`, `meta_tags` and `social_links` are safe because the `.extend()` block re-declares them as plain `.optional()`. One-line fix, needs its own test.
- **`isDemo` is hardcoded `true`** in `components/storefront/default/item/DefaultItemPage.tsx`, so every game renders as free regardless of price. Preserved from the original implementation; changing it changes what customers are charged.
- **The three feature `MetaTag`s are hardcoded** in `PurchaseCard.tsx` while `game.meta_tags` exists on the API.
