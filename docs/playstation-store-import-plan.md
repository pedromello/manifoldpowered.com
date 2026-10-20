# PlayStation Store import and rollout

## Goal

Give creators the same import-by-link and batch workflow available for Steam
and Nintendo: PS4/PS5 metadata, artwork and regional reference prices in the
shared catalog, with purchases completed on PlayStation Store. Complete the
existing independent Comunidade PlayStation draft after the provider is deployed.

## Source validation

On 2026-10-20, anonymous requests to the public Brazilian and US product pages
returned edition metadata and public offers. The pages include JSON-LD and
application/json caches; these are website formats, not a documented catalog API.
The adapter must validate their shape and fail explicitly when it changes.
No PSN account, private token, browser automation or persisted-query hash is needed.

The initial product set comes from the respective official game pages:

| Game                             | Product ID for the selected edition  |
| -------------------------------- | ------------------------------------ |
| Astro Bot                        | UP9000-PPSA21564_00-0000000000000000 |
| Final Fantasy VII Rebirth        | UP0082-PPSA08666_00-0783148264580163 |
| God of War Ragnarök, PS5 edition | UP9000-PPSA08329_00-GOWRAGNAROK00000 |
| Returnal                         | UP9000-PPSA01284_00-RETURNALGAME0001 |
| Marvel's Spider-Man 2            | UP9000-PPSA03016_00-MARVELSPIDERMAN2 |

Sources: [Astro Bot](https://www.playstation.com/pt-br/games/astro-bot/),
[Rebirth](https://www.playstation.com/pt-br/games/final-fantasy-vii-rebirth/),
[Ragnarök](https://www.playstation.com/pt-br/games/god-of-war-ragnarok/),
[Returnal](https://www.playstation.com/pt-br/games/returnal/),
[Spider-Man 2](https://www.playstation.com/pt-br/games/marvels-spider-man-2/).
The [exact Astro Bot product](https://store.playstation.com/pt-br/product/UP9000-PPSA21564_00-0000000000000000)
was checked in both pt-br/BRL and en-us/USD. Recorded prices are deliberately
not hardcoded in this plan.

## Delivery sequence

1. **Source contract:** accept HTTPS product/edition links on the exact official
   host for Brazil and the US. Strip tracking parameters. Reject arbitrary hosts,
   credentials, unsupported regions, demos, add-ons, upgrades and subscriptions.
   Concept/gamehub pages aggregate multiple editions; start with explicit product
   links, and provide guidance to choose an edition.
2. **Identity and storage:** add nullable unique playstation_product_id to Game,
   PLAYSTATION localization provenance, import audit and fenced-refresh records.
   Keep full product IDs rather than titles, concept IDs, CUSA/PPSA title prefixes
   or Steam IDs as the deduplication key. Each edition has its own game record.
   Reuse GameExternalOffer's unique game/provider/country key, Decimal(19,4)
   amounts and captured_at; add optional expires_at for promotion validity.
   Use an additive migration, existing UUID conventions and indexed refresh and
   per-user audit lookups. Do not rewrite existing provider IDs.
3. **Gateway and parser:** make bounded anonymous requests with timeout and
   validated same-product/same-region redirects. Merge normalized cache entries
   only by equal keys. Read the requested Product entry and its exact SKU's
   outright purchase CTA; never select an upsell or another edition on the page.
   Import PS4/PS5 platforms, edition, publisher, localized descriptions, languages,
   screenshots and supported official trailers. Preserve an unknown developer
   rather than treating the publisher as the developer.
4. **Public prices:** accept the applicable anonymous outright offer in the
   region's currency, using integer minor units. Ignore subscription inclusion,
   subscriber-exclusive offers and trials. A missing price is unknown, not zero.
   Keep BRL and USD independent, record capture and expiration, and suppress
   expired/stale promotions. A transient regional failure must not erase the
   previously captured offer. Do not convert currencies or claim live pricing.
5. **Shared service and permissions:** register a PlayStation strategy and storage
   binding in models/external_import. Reuse per-user quotas, transactional leases,
   fencing, cooldown, operation IDs, polling and journal recovery. Grant the
   equivalent import feature to activated accounts, including existing importers.
   Imported console games stay ONLY_DISPLAY, with no Manifold checkout, studio
   ownership claim, library entitlement or distributable build upload.
6. **API, CLI and UI:** expose POST/GET /api/v1/items/games/playstation-import,
   games import playstation, batch provider playstation, status/resume and the
   browser import form. Extend public DTOs, price cards, purchase buttons,
   localization, promotions, supported media hosts and outbound attribution.
   Purchases link to the matching official regional edition.
7. **Verification:** cover URL/redirect validation, exact-edition matching,
   subscriber vs public offers, price expiration, missing/zero prices, regional
   failures, concurrency/deduplication and catalog-only restrictions. Run provider
   and existing storefront/Steam/Nintendo regressions, CLI schemas and typechecks.
   Exercise import, refresh, curation and anonymous public reads against an
   isolated migrated database; inspect desktop and mobile in the browser.
8. **Rollout and outlet:** deploy the additive migration with the existing
   production migration policy, then validate the production import endpoint with
   the real account. Reuse the existing comunidade-playstation draft; never create
   a duplicate or silently use PC editions. Import the five confirmed products,
   initialize its handpicked catalog, add credited editorials and highlights,
   inspect readiness/verify/preview, publish the outlet, then publish its selection
   using the selection's own current revision. Confirm anonymous URLs and record
   IDs/revisions in private editorial control. Preserve Nintendo's published state.

## Follow-up scope

Catalog-wide discovery can later read public browse pages and queue explicit
product references through the same importer, with resumable pagination, bounded
concurrency and deduplication. A whole-store crawl and recurring price jobs are
separate from the import parity delivery. No recurring automation is enabled by
this implementation. PS Plus entitlement tracking requires its own data model
and must not be inferred from a zero price or subscription upsell.

## Recovery

If the source blocks requests or changes format, stop that import and retain
the last known catalog data. Cached reference prices remain labeled with their
capture time; expired promotions must disappear without requiring a successful
refresh. Report the provider outcome and operation ID. Do not repeat a mutation
whose outcome is unknown; inspect the resource and journal first.
