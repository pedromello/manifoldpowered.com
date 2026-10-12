# Gift card checkout — development session

This delivery adds buyer checkout, independently of game acquisitions and
affiliate payouts. It is disabled outside `development` and `test`, accepts
Stripe **test** keys only, and issues explicitly nonredeemable demo gift cards.
It does not establish processor approval or access to any external gift card
service. There is no selectable fake payment processor in application runtime.

## Local configuration

Use securely configured runtime variables or an ignored `.env.development.local`:

| Variable                 | Purpose                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`      | Real Stripe test secret key; live keys are refused.                                                            |
| `STRIPE_WEBHOOK_SECRET`  | Signing secret for the configured test webhook listener.                                                       |
| `STRIPE_CHECKOUT_ORIGIN` | Application origin for return URLs; defaults to `http://localhost:3000`. HTTPS is required except on loopback. |

Do not commit credentials or paste them into logs or chat. Hosted Checkout needs
no browser publishable key and Manifold neither collects nor persists card data.
The existing tracked development environment contains **no Stripe credentials**.
Checkout is unavailable until both secrets exist. Availability indicates local
configuration, not that Stripe has accepted the account or enabled test access.

After `npm i`, `npm run dev` starts the existing local services, generates Prisma,
applies migrations, and runs Next.js. Open `/library/gift-cards` using an activated
account. The catalogue has three synthetic BRL products; all prices and quantities
come from the server. There is no currency conversion or affiliate commission in
this gift card delivery. The existing game purchase and ledger behavior is
unchanged.

If test access becomes available, forward test webhook events to
`POST /api/v1/webhooks/stripe` with a supported Stripe CLI listener. Configure its
signing secret securely, restart development, and test approved sandbox payment
methods. No real Stripe round trip was performed in this session.

## Local demo seed (without Stripe)

The public store at `/store` features gift cards and links to
`/store/gift-cards`, also reachable through desktop/mobile navigation. The
public `/api/v1/gift-cards` endpoint returns product information and checkout
availability only, never orders or codes. Anonymous visitors can browse and
sign in with a return path for their selected product. Purchase keys are scoped
to the authenticated buyer; prices still come from the server. The library
contains purchases, recovery actions and code revelation, with a link back to
the store instead of products for sale. All demo surfaces remain disabled in
production. Public platform artwork is used for visual prototypes only; it
does not establish real credit issuance or a commercial integration.

Run `npm run gift-cards:seed -- --confirm-database=local_db` after starting
the local services and applying migrations. The seed refuses remote/system
databases and production, never clears tables, and preserves existing demo
orders when repeated. It creates the activated buyer `gift_card_demo`
(`gift-card-demo@example.test`) and three synthetic orders: delivered with
code hidden, delivered with a recorded disclosure, and issuance failed so
the UI can retry delivery. Payment timestamps are fixtures, not evidence of
a Stripe payment; no Stripe sessions or webhook receipts are fabricated.

Open `http://localhost:3000/login?callbackUrl=/library/gift-cards`, request
the login code for that buyer, and read the email at `http://localhost:1080`.
Reveal the hidden card through the confirmation modal and retry the failed
delivery. All codes are explicitly nonredeemable. The R$50 fixture blocks a
new purchase of that product until its delivery is recovered. Buying via
Checkout still requires real Stripe test credentials; the seed does not
enable or simulate that payment gateway.

## API endpoints

All order endpoints require the session user and existing library permissions.
Reads and writes return `Cache-Control: no-store`; ownership is checked in the
model, and other buyers receive 404.

| Endpoint                             | Behavior                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/gift-card-orders`       | Synthetic catalogue, checkout configuration availability and the buyer's latest 50 orders.                                                               |
| `POST /api/v1/gift-card-orders`      | Start or replay a purchase using `product_code` and a client-generated UUID `idempotency_key`. Extra fields, including price and currency, are rejected. |
| `GET /api/v1/gift-card-orders/[id]`  | Read the buyer's order, including older orders reached by the return URL.                                                                                |
| `POST /api/v1/gift-card-orders/[id]` | `action`: `checkout`, `cancel`, or `retry_issuance`.                                                                                                     |
| `POST /api/v1/webhooks/stripe`       | Raw body, timestamped signature verification with the Stripe SDK, test events only. Maximum body: 1 MiB.                                                 |

## Confirmation and recovery

`CHECKOUT_PENDING → AWAITING_PAYMENT → PAID → FULFILLED` is the normal flow.
An emission failure leaves `ISSUANCE_FAILED` with payment preserved, and can be
retried without creating a checkout or charging again. A delivered order adds
exactly one `LibraryItem` of type `GIFT_CARD`, referencing the order. The existing
game library continues to list only `GAME`; gift cards have their own library
screen and private code projection.

- A success or cancel return URL is presentation only. Reading an order never
  changes its state or emits a card.
- Supported confirmations are `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`. Before issuance, the server
  retrieves the current Checkout Session and verifies its session ID, mode,
  test flag, order metadata, client reference, currency, amount, complete status,
  paid status and payment reference. An unpaid completion waits.
- Signed events are recorded by ID in the same transaction as payment state.
  Raw event bodies, card details and SDK error bodies are not persisted or logged.
  Duplicate and concurrent notifications cannot repeat delivery. A repeated
  success notification can recover a failed issuance or delayed paid state.
- `payment_intent.payment_failed` records a failed attempt while retaining the
  same open checkout. `checkout.session.async_payment_failed` ends an unpaid
  completed checkout as `PAYMENT_FAILED`; an expired checkout becomes
  `CANCELLED`. Delayed negative events cannot undo a confirmed payment.
- Explicit cancellation retrieves and expires the Stripe session before freeing
  the active purchase. A completed/paid checkout waits for its webhook. An
  uncertain checkout-create response is recovered with the same Stripe key
  before cancellation; an expiration race returns a retryable error.
- Reusing a purchase key returns the original order even after cancellation or
  delivery. A deliberate new purchase needs a new key. Concurrent new keys for
  the same buyer/product are blocked while payment or delivery remains pending.
- Order creation is persisted before Stripe is called. A stable Stripe key
  survives lost responses and database rollback. An unbound checkout older
  than **23 hours** is blocked for manual reconciliation rather than recreated:
  Stripe can discard idempotency records after 24 hours. Keep the order ID and
  reconcile Stripe metadata before closing it; do not delete it or reset its key.

The migration includes a partial unique index for active buyer/product purchases
and constraints for positive amounts and paid delivery. Preserve these SQL
constraints in future migrations. Order row locks serialize checkout,
cancellation and issuance; external operations have bounded timeouts and the
database transaction has a 30-second timeout. This is an intentionally small
development delivery. A real slow/asynchronous supplier should move issuance to
a durable worker using the same order reference and reconciliation contract.

## Gift card provider boundary

`GiftCardProvider` exposes a catalogue and virtual-card issuance using an
immutable product snapshot and stable `request_id`. The simulator returns the
same explicit demo code/reference across retries and process restarts; it keeps
no ephemeral in-memory delivery ledger. There is no production registry entry or
configuration option that can activate the simulator in production.

The public external API reference was inspected read-only. The useful concepts
are authentication, product catalogue, virtual-card order and tracking by the
client's request reference. Some schemas contain recipient/contact fields, but
the documentation does **not** prove required recipient data, issuance response
shape, stock guarantees, idempotency, or reconciliation behavior. No external
names, domains, credentials or raw specification were saved in this repository.
The fixtures use synthetic products, payment sessions and order references.

A real adapter must reconcile an uncertain issuance by the stable reference
before attempting another issuance, and return the original delivery on replay.
Do not wire a live provider until those guarantees, required fields, response
mapping and homologation behavior are verified with authorized access. Refunds,
disputes, live checkout, asynchronous supplier tracking, financial ledger
integration and operational reconciliation tooling remain subsequent work.

## Verification

### Local storefront prototype

The public store home and gift-card navigation now expose the demo catalog,
with a dedicated `/store/gift-cards` page. The library retains purchase history
and delivery/recovery actions. The catalog endpoint is anonymous; order endpoints
still require authentication. These storefront entries remain development/test only.

Illustrative local artwork comes from the official public
[Nintendo eShop cards](https://www.nintendo.com/us/retail-offers/nintendo-eshop-cards/),
[PlayStation gift cards](https://www.playstation.com/en-us/playstation-gift-cards/),
and [Steam digital gift cards](https://store.steampowered.com/digitalgiftcards/selectgiftcard)
pages. Artwork does not represent actual stock, regional denominations or
redeemable credit. Prices and issued demo codes remain synthetic.

Local storefront verification: five focused unit suites, 20 tests passed,
including anonymous catalog access, private order access boundaries, checkout
availability, library separation and deterministic demo issuance.

Payment gateway fixtures exist only under `tests/`. Tests use the real Stripe
signature algorithm and an isolated local PostgreSQL database, covering reliable
confirmation, duplicate notifications, concurrent requests, lost checkout
responses, mismatched amounts/products/currency, cancellation, declined payment,
failed issuance, replay recovery and ownership. The browser verification uses
synthetic order data; it does not claim a real Stripe test payment.

External gift card homologation remains pending. The local Stripe sandbox now
has a real test key and webhook signing secret stored only in the ignored
`.env.development.local`. A store purchase created a real test Checkout Session;
an unrelated checkout probe was expired without payment, and its signed event
reached the local webhook with HTTP 200. Completing a test payment and checking
the resulting delivery remain pending. The CLI listener was replaced with an
ngrok HTTPS tunnel after repeated DNS timeouts resolving the Stripe CLI websocket
host. A snapshot webhook destination was registered in the Stripe test Dashboard
for the four `checkout.session.*` events. Its own signing secret replaces the CLI
secret in the ignored local environment. A real expiration event passed through
the ngrok tunnel and the local webhook returned HTTP 200. The issuer still
produces demo codes.
No production payment or publication is part of this local setup.

The tunnel forwards to `scripts/gift-card-webhook-proxy.mjs`, listening on
`127.0.0.1:3001`. It permits only signed POST requests to
`/api/v1/webhooks/stripe`, forwards their raw bodies to port 3000, and logs only
the response status. Other routes return 404; missing signatures return 400.
Request inspection is disabled on the ngrok agent. Run the proxy and then
`ngrok http http://127.0.0.1:3001 --inspect=false`; register the assigned HTTPS
URL plus the webhook path in the Stripe test Dashboard. Keep both processes and
the development server running. If the assigned URL changes, update the Stripe
destination. No host or container IP was pinned.

Store and library copy now use ordinary purchase labels, including `Buy` and
`Your purchases`. Demo identification remains in the product name. UI copy does
not alter the backend's test-key restriction or deterministic demo issuance.

Session verification results:

- Full existing suite on the isolated local database: **242 suites, 1,561 tests
  passed** (`jest --runInBand --forceExit`; existing suites retain open handles).
- Final focused verification of this delivery: **6 suites, 56 tests passed**.
- ESLint, Prettier, migration deployment, application type checking and the
  optimized production build passed.
- `tsc --noEmit` retains **15 pre-existing diagnostics in test files**, compared
  against the original commit in a temporary checkout; no new diagnostics.
- Browser verification covered anonymous access, configured-unavailable checkout,
  pending payment, issuance recovery, one delivered demo code, logout privacy,
  Portuguese UI and desktop/mobile layout without horizontal overflow.
- Confidentiality scan of every changed/new file passed. The development server
  was returned to the original local development database after testing.

## Changed files

- `.gitignore`
- `package.json`, `package-lock.json`
- `prisma/schema.prisma`
- `prisma/migrations/20261001020000_gift_card_test_checkout/migration.sql`
- `infra/gift_card_provider.ts`, `infra/stripe_checkout.ts`
- `models/gift_card_order.ts`
- `pages/api/v1/gift-card-orders/index.ts`
- `pages/api/v1/gift-card-orders/[id]/index.ts`
- `pages/api/v1/webhooks/stripe/index.ts`
- `pages/library/gift-cards.tsx`, `pages/library/index.tsx`
- `lib/i18n/pt-BR.ts`
- `tests/fixtures/gift_card_checkout.ts`
- `tests/integration/models/gift_card_order.test.ts`
- `tests/integration/api/v1/gift-card-orders.test.ts`
- `tests/unit/infra/gift_card_provider.test.ts`
- `tests/unit/infra/stripe_checkout.test.ts`
- `tests/unit/api/stripe_webhook.test.ts`
- `tests/unit/pages/gift-cards.test.tsx`
- `docs/gift-card-checkout.md`
