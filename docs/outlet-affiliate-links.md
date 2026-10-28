# Outlet affiliate links

Outlets can publish their own Amazon, Mercado Livre and Nuuvem links. These are external destinations; purchases and commissions are handled by the merchant's affiliate program.

## Creator workflow

Use **Manage Outlet → Affiliates**. General links appear beside social links on the public Outlet. Gift cards are configured per merchant and platform (Steam, Nintendo, PlayStation or Xbox), for redemption in Brazil. Game links select an existing catalog game, platform and physical/digital media.

Save changes to the draft, then publish the Outlet. Preview shows the draft with disabled outgoing affiliate links. Existing public links remain unchanged until publication. An outdated draft returns HTTP 409 instead of overwriting another editor.

For each merchant/platform, specific game links take precedence over compatible gift cards. If a merchant has neither for the game, its general affiliate link appears once in the purchase section, including games without a recognized platform. The primary destination has a direct "Buy at" button and the remaining destinations are secondary purchase links. General links are identified as affiliate links without claiming to be a specific product, gift card or confirmed price. Invalid destinations and incompatible gift cards are hidden. The primary button prefers a specific game link, then a gift card, then a general link. Specific offers and gift cards keep merchant ties ordered Amazon, Mercado Livre, Nuuvem; general links prefer Nuuvem, Amazon, Mercado Livre. Original affiliate URLs are preserved, so a general destination can still open the merchant's catalog. Official store prices and buttons remain separate.

## API

- `GET /api/v1/stores/:slug/affiliate-links?draft=1`: authorized draft and revision.
- `GET /api/v1/stores/:slug/affiliate-links`: published general links and publication ID.
- `GET /api/v1/stores/:slug/affiliate-links?game_slug=:game`: resolved published game destinations. Authorized `preview=1` reads the draft.
- `POST` / `PATCH` on the same endpoint: `{expected_draft_revision, link}`; PATCH requires the stable link ID inside `link`.
- `DELETE` on the same endpoint: `{expected_draft_revision, id}`.

The canonical enums and input validation live in `contracts/outlet-affiliates.ts`. URLs must use HTTPS and an approved merchant domain/official tracking wrapper. Parameters are preserved. The server does not fetch arbitrary supplied URLs or verify commission eligibility.

The contract also lists three explicitly approved public creator aliases: `https://coelhonojapao.com/amazon`, `https://coelhonojapao.com/mercadolivre` and `https://coelhonojapao.com/nuuvem`. Each literal URL is accepted only for its matching merchant, without query strings, fragments, alternate paths or custom-domain expansion. The original URL is stored unchanged. Public redirects were checked on 2026-10-27: Amazon reaches `amazon.com.br` via `amzn.to`; Mercado Livre redirects to `mercadolivre.com.br` (its destination blocks automated requests); Nuuvem reaches `nuuvem.com`. These checks are deployment evidence, not ongoing guarantees about third-party redirects.

## Analytics

Uses the existing `product_events` table, `/api/v1/events` collector and client context. `external_store_clicked` measures official destinations; `affiliate_link_clicked` validates a link ID and publication against the public snapshot. Events contain dimensions, never full affiliate URLs. Private previews do not collect clicks. Analytics must not delay external navigation.

Creator reports: `GET /api/v1/stores/:slug/analytics`, guarded by `read:store_analytics` on that Outlet. The owner and explicitly authorized members can read aggregates; financial-only membership does not grant analytics. Platform reports: `GET /api/v1/analytics/outbound`, guarded by administrative access. The matching interfaces are the Outlet's **Store clicks** tab and `/backoffice/analytics`.

Reports support 7/30/90 days, bounded custom ISO dates, game, merchant/provider, kind, platform and button placement; global reports also support Outlet filtering. Default is 30 days. Collection availability and actual retention are returned. Clicks and visits with clicks are observations, not unique people, confirmed sales or commissions. Missing historical dimensions are labeled historical, without backfilling invented values.

## Deployment and verification

Apply the additive `20261027010000_outlet_affiliate_links` migration and regenerate Prisma before deploying application code. Existing revisions receive empty affiliate snapshots. Run the normal feature backfill for the new analytics features; existing dashboard administrators retain access during rollout. Keep the existing product-event collection flags and secret configured; collection status accounts for both client and collector flags. No new external credentials are required for affiliate links.

Focused tests cover contracts/fallbacks, publication/concurrent editing, preview access, HTTP event validation and deduplication, official PlayStation availability, creator/admin report isolation, all storefront presets, and normal/middle-click navigation. No historical click counts are synthesized.
