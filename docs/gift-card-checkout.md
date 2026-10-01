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
account. The catalogue has two synthetic BRL products; all prices and quantities
come from the server. There is no currency conversion or affiliate commission in
this gift card delivery. The existing game purchase and ledger behavior is
unchanged.

If test access becomes available, forward test webhook events to
`POST /api/v1/webhooks/stripe` with a supported Stripe CLI listener. Configure its
signing secret securely, restart development, and test approved sandbox payment
methods. No real Stripe round trip was performed in this session.

## Endpoints

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

Payment gateway fixtures exist only under `tests/`. Tests use the real Stripe
signature algorithm and an isolated local PostgreSQL database, covering reliable
confirmation, duplicate notifications, concurrent requests, lost checkout
responses, mismatched amounts/products/currency, cancellation, declined payment,
failed issuance, replay recovery and ownership. The browser verification uses
synthetic order data; it does not claim a real Stripe test payment.

The external gift card homologation and real Stripe sandbox validation remain
pending. No push, PR, merge, deployment, production call or account/configuration
change is part of this session.

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
