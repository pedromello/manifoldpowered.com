# Outlet discovery: prices and featured videos

The community outlet home follows the A1 composition: compact creator identity,
curated game cards, a regional promotions shelf, and links to selections. The B2
selection page uses ordered desktop rows and single-column mobile content.

## Prices and promotions

`GamePriceBlock` shares the storefront pricing contract across featured games,
catalog cards and selections. Prices retain their provider currency; a BRL offer
is never compared with a USD base price. The promotion badge is always flat
`#FFB400` with dark text, independently of the outlet palette.

An external offer is eligible for promotion only when its current/original
prices are coherent, its percentage is an integer between 1 and 100, and its
capture is recent. `EXTERNAL_OFFER_MAX_AGE_HOURS` accepts values from 1 to 720
and defaults to 24. Older or unknown captures show a recorded-price state,
without advertising an active discount. This does not add automatic provider
refresh or promise live prices. The provider remains the purchase authority.

`GET /api/v1/stores/:slug/search?on_sale=1` resolves regional promotion eligibility
before filtering and pagination. It preserves published curation, regional
availability, search and rating constraints. Selection filters operate on the
complete eligible selection while retaining author order.

Prices are resolved from the catalog on read. Editorial publication snapshots
freeze curation, not changing provider prices. A missing price is never free.
