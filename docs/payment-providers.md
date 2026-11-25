# Buyer payments: Appmax and Stripe

Buyer orders use a neutral `PaymentProvider` interface. Appmax is the default;
Stripe remains selectable by `PAYMENT_PROVIDER=stripe`. Selection is server-side
and fixed on each order. There is no automatic provider failover after an error.
Gift-card delivery is a separate integration. `GIFT_CARD_PROVIDER=api` selects
asynchronous delivery directly to the buyer's verified email; synthetic `CODE`
orders retain their nonredeemable demo flow in development/tests. Payment
configuration alone does not import inventory or establish supplier access.

## Local setup

Apply migrations and generate the Prisma client using the existing project
commands. The migration is additive, copies only Stripe-bound gift-card purchases
into common payment history, and does not fabricate payments for demo fixtures.
Old game acquisitions appear as acquired, without claiming verified payment.

Store these values in the ignored `.env.development.local`, never in Git or chat:

```dotenv
PAYMENT_PROVIDER=appmax
PAYMENT_ENVIRONMENT=sandbox
APPMAX_CLIENT_ID=replace_with_merchant_client_id
APPMAX_CLIENT_SECRET=replace_with_merchant_client_secret
APPMAX_EXTERNAL_ID=replace_with_merchant_external_id
APPMAX_AUTH_URL=https://auth.sandboxappmax.com.br/oauth2/token
APPMAX_API_URL=https://api.sandboxappmax.com.br
APPMAX_WEBHOOK_TOKEN=replace_with_a_random_secret_of_at_least_32_characters
```

The checkout uses sandbox merchant credentials. The Appmax adapter creates an
individual payment link for each order and offers Pix and single-installment
card payment on the hosted page. Appmax requires a minimum of R$ 5.00. The
recipient and verified delivery email stay in the store checkout. Payment
details are entered on the hosted page. Once a link is issued, reopening that
order resumes the same link.

The External ID is used by legacy direct Appmax integrations. If it is needed
for the existing direct-payment tooling, import it:

```powershell
npm run payments:configure-appmax -- --external-id YOUR_INSTALLATION_UUID
npm run payments:worker
```

If `APPMAX_EXTERNAL_ID` is already in the ignored local environment file,
`npm run payments:configure-appmax` imports it without a command-line argument.
Run `npm run payments:check-appmax` to verify authentication and an installment
quote without creating an order or charging. Endpoint overrides are validated
against official sandbox URLs; credentials are never sent to arbitrary hosts.

The worker loads Next.js environment files, including local overrides. Restart
the server or worker after changing credentials or provider configuration.
Production payments are deliberately blocked in this delivery.

To exercise Stripe instead, set `PAYMENT_PROVIDER=stripe` and retain the existing
ignored Stripe test key and signing secret. Its adapter supports hosted card
checkout in one installment. Existing in-site Appmax payment attempts can still
be reconciled.

## Webhooks and worker

Configure the **panel webhook** for the own store. The endpoint path is
`/api/v1/webhooks/appmax/<private-webhook-token>`. Use a dedicated HTTPS tunnel
forwarding only this route; do not expose the full development app. Keep the actual
URL and token outside repository files. Disable tunnel request inspection, and
redact this path in any proxy/access logs. The application error logger redacts it.
Run `npm run payments:webhook-proxy` and then
`ngrok http http://127.0.0.1:3001 --inspect=false`. The proxy accepts only the
private Appmax path and signed Stripe POST requests; other routes return 404.
Stop the previous Stripe-only proxy before reusing port 3001.

Panel events include `OrderPaid`, `OrderApproved`, `OrderAuthorized`,
`OrderIntegrated`, `OrderPendingIntegration`, `OrderPaidByPix`, `OrderPixExpired`,
`PaymentNotAuthorized`, `OrderRefund`, `OrderPartialRefund`,
`OrderRefusedByRisk`, `OrderChargeBackInTreatment`, and `OrderChargeBackGain`.
Panel envelopes use `data.id`; Appstore `data.order_id` envelopes are rejected.
The panel's `environment` field is not an environment boundary.

Notifications schedule verification. The endpoint binds a known external order
or payment link to a local attempt within the same provider and environment,
writes durable work and acknowledges. For an Appmax link the worker verifies
the order through the authenticated link and order APIs and checks the amount
and payment method before settlement. Buyers can return to the store order and
request the same reconciliation from the checkout. Stripe continues using its
signed raw-body endpoint and enqueues the same kind of work for common orders.
Unknown notifications never create orders or grant products. Raw webhook bodies
and card/token payloads are not persisted.
Verified status receipts live in `purchase_payment_events`, once per attempt
and financial state. They retain payment, refund and chargeback history without
trusting or retaining incoming notification bodies.

Jobs live in PostgreSQL, use row locks and expiring claims, and survive restarts.
Polling backs off to 15 minutes; notifications bring reconciliation forward.
Uncertain creation without a recoverable remote reference requires manual review.
Do not clear `uncertain` or create a replacement payment until the remote account
has been reconciled. Retry delivery does not charge again. Observe job age,
`last_error`, and backlog; do not depend only on provider webhook retries.

## Appstore sandbox URL setup

Scope the Appstore configuration to the Preview branch used for homologation.
Set `APPMAX_APPSTORE_NUMERIC_ID` to the numerical Appstore app ID and
`APPMAX_APPSTORE_APP_ID` to the public app UUID. Store a separate random,
URL-safe `APPMAX_APPSTORE_WEBHOOK_TOKEN` of at least 32 characters as a secret.

Set `APPMAX_MERCHANT_CLIENT_ID` and `APPMAX_MERCHANT_CLIENT_SECRET` together
in Preview for the checkout to use the installed sandbox merchant. The
installation uses its separate `APPMAX_APPSTORE_CLIENT_ID` and
`APPMAX_APPSTORE_CLIENT_SECRET` when supplied. Existing environments can
continue to use `APPMAX_CLIENT_ID` and `APPMAX_CLIENT_SECRET` as the fallback
pair for their configured use.

- Platform URL uses the Preview origin that buyers can open in a browser.
- Validation URL uses `/api/v1/appmax/health` on that origin. Send a `POST`
  with the numerical `app_id` to verify that two calls return distinct v4 UUIDs.
  The route also accepts the documented synthetic Appmax validator payload.
- Webhook URL uses `/api/v1/webhooks/appmax/<private-token>/appstore` on the
  same origin. Keep the token and complete URL out of Git and diagnostic output.
  Matching notifications schedule reconciliation of the existing sandbox order
  through its recorded payment attempt.

The validation route checks the URL contract for Appstore setup. A synthetic
response does not identify a store installation. Before completing merchant
installation, connect the authorization and callback flow to durable storage of
the installation ID returned by the validation route. Configure the merchant's
own Client ID and Client Secret and the matching External ID before testing a
checkout. See the [Appstore installation guide](https://docs.appmax.com.br/guides/instalacao)
and [Appstore webhook contract](https://docs.appmax.com.br/guides/webhooks).

## API and delivery

- `GET/POST /api/v1/orders`: private order history / server-priced order creation.
- `GET/POST /api/v1/orders/:id`: private detail / reconcile or safe cancellation.
- `GET/POST /api/v1/orders/:id/quote`: installment options / expiring quote reservation.
- `POST /api/v1/orders/:id/payment`: one submission of the accepted quote.
- `POST /api/v1/orders/:id/recipient`: confirmed recipient name/document for email
  gift cards; the server derives the verified email and requires this before payment.
- `/checkout/:id`: buyer details, Pix instructions or card tokenization.
- `/library/orders`: payment state and delivery availability for games/gift cards.

Prices are BRL cent integers at the provider boundary; the existing Decimal ledger
retains its precision. The quote snapshots product price, financing surcharge and
charged total. The Appmax order receives that total **once**, because Appmax does
not add interest automatically. Commissions use the product price; financing is
kept in a separate clearing account, outside product revenue and commission.
Product revenue reporting excludes financing clearing.

Game price, supplier terms and Outlet attribution are captured at order creation.
Confirmed payment creates entitlement, Sale and balanced ledger in one transaction,
once per order. Paid games cannot be acquired directly through `POST /library`;
free games retain direct acquisition. External-store/private products cannot use
this checkout. Historical acquisitions are not migrated into invented payment proof.

Card `autorizado` means processing, not completed payment. Refund/dispute state
does not erase the original confirmation timestamp, and stops pending delivery.
Already delivered products and refunds require operational review. First revelation
remains available only for legacy `CODE` gift cards. Email deliveries never expose
a code or delivery link through the buyer API or UI.

For email gift cards, authenticated payment confirmation queues durable fulfillment;
it does not mark the product delivered. Backoffice operations submit the stable
gift card order reference once and track accepted/uncertain requests. Tracking
status `3` confirms delivery; `7` stops tracking and requires review. Pending
lookups run no earlier than their stored six-hour deadline, except for the
restricted homologation early-lookup action. Do not reset or repost an uncertain
submission. See [Gift card checkout](gift-card-checkout.md) and the private
configuration guidance in the [email delivery runbook](gift-card-email-delivery.md).

Homologation exposes purchases through explicit sandbox/runtime flags while live
production payments remain blocked. Gift card operations are manual through
`/backoffice/gift-cards`; no automatic gift card schedule is activated. The existing
standalone payment worker can reconcile payments locally but does not run catalog
sync or email delivery jobs.

## Verification boundaries

The full registration-to-disclosure journey lives in
[`tests/integration/_use-cases`](../tests/integration/_use-cases/README.md).
Run `npm run test:use-cases:gift-cards` for Appmax Pix/card journeys and the
existing Stripe regression cases. Keep the standalone payment worker stopped
during these fixtures; each test processes only its own persisted jobs.

Payment contract tests use synthetic responses matching the payment OpenAPI. Integration
tests use real local PostgreSQL transactions and a payment fixture that cannot be
selected at runtime; they remove only rows they created. They cover concurrency,
lost responses, wrong amounts, authorization-only cards, price snapshots, balanced
ledger, repeated disclosure, refunds and durable worker claims.

Email gift card tests use synthetic responses and local transactions; actual
authentication, catalog mapping, accepted submission, tracking and inbox delivery
must still be verified privately with authorized homologation credentials. No
external gift card round trip is established by these tests.

Real Appmax sandbox validation requires configured merchant credentials, installation
and panel webhook. No claim of an external payment is made by fixture tests. Test
approved/captured, pre-authorized, declined and unavailable card scenarios, plus
approved and pending Pix, using the official sandbox documentation.

Sources: [Own-store setup](https://docs.appmax.com.br/guides/meus-tokens),
[Appmax JS](https://docs.appmax.com.br/guides/appmax-js),
[panel webhooks](https://docs.appmax.com.br/guides/webhooks-painel),
[installments](https://docs.appmax.com.br/api-reference/payments/parcelas),
[order totals](https://docs.appmax.com.br/api-reference/orders/calculo-valor).
