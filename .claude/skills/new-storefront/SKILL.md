---
name: new-storefront
description: Build a bespoke storefront design for one Manifold outlet. Use when the user asks for a custom interface, custom look, or its own design for a specific store/outlet (by name or slug) — e.g. "I want a custom interface for outlet X", "make store Y look like Z", "give <slug> its own page". Not for changing the default storefront that all outlets share.
---

# Building a custom outlet storefront

Read [`docs/custom-storefronts.md`](../../../docs/custom-storefronts.md) first — it holds the contract and the reasoning. This file is the procedure.

## What you are and are not free to change

Free: layout, colours, typography, copy, extra sections, imagery, animation. The outlet should not look like Manifold.

Not free: the outlet must still work as a storefront. Search, category filtering, the catalogue listing, and `?store=` attribution on every game link are all supplied to you as props. You render them; you do not reimplement or omit them.

## Steps

1. **Confirm the outlet exists.** `GET /api/v1/public/stores?q=<name>` on the running dev server, or query `store.findAllPaginated`. You need its exact slug — the registry is keyed on it. If it does not exist, stop and ask; do not invent one.

2. **Ask for the vibe if it was not given.** One question, not five: what should it feel like, and is there a reference. Do not ask about functionality — that half is fixed.

3. **Copy the template.** `cp -r storefronts/_template storefronts/<slug>`. Rename `TemplateStorefront` → `<Name>Storefront` and `templatePalette` → `<name>Palette`.

4. **Set the palette first.** Seven values in `palette.ts`. They drive the page background, the PWA status bar, and every shared component the theme reuses, so getting them right early makes the rest read correctly as you build.

5. **Write the storefront.** Rewrite `Storefront.tsx` freely. It receives `StorefrontViewProps`. Keep:
   - `data-storefront="search"` on the search input, submitting to `searchAction`
   - `data-storefront="filters"` on the category container
   - `data-storefront="game-list"` on the catalogue container
   - `data-storefront="game-link"` on every game link, with `href={itemHref(game.slug)}`

   Never mirror `q` / `activeCategory` / `order` into `useState` — the URL is the source of truth. Never hand-write `/item/${slug}` — that drops attribution and the sale stops paying out. Handle `featured.length === 0` and `games.length === 0`.

   Extra sections are encouraged. `useStorefrontTrending` / `useStorefrontNewReleases` exist for rails the default storefront does not have.

6. **Optionally add `ItemPage.tsx`** exporting a component typed `ItemViewProps`. Omit it and the outlet keeps Manifold's product page in its own palette, which is usually the right first move.

7. **Assets go in `public/storefronts/<slug>/`.** `next/image` throws at runtime for any host missing from `remotePatterns` in `next.config.js`, so do not reach for a CDN URL.

8. **Register it** in `storefronts/registry.ts` with `next/dynamic` and `{ ssr: true }`. Never `ssr: false` — it reintroduces the colour flash and removes the outlet from search results.

9. **Verify by driving the browser**, not by reasoning about the code. Chromium is at `/opt/pw-browsers/chromium`; never run `playwright install`. Walk the numbered checklist in `docs/custom-storefronts.md`. The dev console must show no `[storefront contract]` errors.

10. **Run `npm run lint:prettier:check` and `npm run lint:eslint:check`.** Prettier covers the whole repo including Markdown.

## Scope discipline

The PR should be one new directory plus one line in the registry. If you find yourself editing `components/storefront/`, `useStorefrontController`, or the default theme to make an outlet work, stop — either the outlet is asking for something the contract should offer everyone (raise it), or it is doing something it should do inside its own directory.
