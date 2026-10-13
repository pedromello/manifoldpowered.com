# Buyer payments: Appmax and Stripe

Buyer orders use a neutral `PaymentProvider` interface. Appmax is the default;
Stripe remains selectable by `PAYMENT_PROVIDER=stripe`. Selection is server-side
and fixed on each order. There is no automatic provider failover after an error.
Gift-card issuance is a separate integration and continues to return explicitly
nonredeemable demo codes. Payment support does not enable real gift-card inventory.

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

This integration uses the **own-store API** in the Appmax panel. Appstore app
installation and its different webhook envelope are not used. Obtain the merchant
credentials and External ID in the sandbox panel's API tab. Import the External ID:

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
the server/worker after changing credentials or provider configuration. The External
ID is non-secret configuration stored in `payment_installations`; it is read from
the database for checkout. Sandbox script, API, auth and installation must match.
Production payments are deliberately blocked in this delivery.

To exercise Stripe instead, set `PAYMENT_PROVIDER=stripe` and retain the existing
ignored Stripe test key and signing secret. Its adapter supports hosted card
checkout in one installment. Appmax supports in-site Pix and tokenized card payments
with the installment options returned by the merchant's configuration, up to 12.

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

Notifications are untrusted signals, not payment proof. The endpoint binds a
known external order to a known local provider/environment, writes durable work,
and acknowledges. The worker queries the authenticated provider, checks customer,
amount, method and installments, and then settles/fulfills. Stripe continues using
its signed raw-body endpoint and enqueues the same kind of work for common orders.
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

## API and delivery

- `GET/POST /api/v1/orders`: private order history / server-priced order creation.
- `GET/POST /api/v1/orders/:id`: private detail / reconcile or safe cancellation.
- `GET/POST /api/v1/orders/:id/quote`: installment options / expiring quote reservation.
- `POST /api/v1/orders/:id/payment`: one submission of the accepted quote.
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
Already delivered products and refunds require operational review. Gift-card first
revelation remains in its existing server transaction and is never displayed as
an implementation detail to buyers.

## Verification boundaries

The full registration-to-disclosure journey lives in
[`tests/integration/_use-cases`](../tests/integration/_use-cases/README.md).
Run `npm run test:use-cases:gift-cards` for Appmax Pix/card journeys and the
existing Stripe regression cases. Keep the standalone payment worker stopped
during these fixtures; each test processes only its own persisted jobs.

Contract tests use synthetic responses matching the official OpenAPI. Integration
tests use real local PostgreSQL transactions and a payment fixture that cannot be
selected at runtime; they remove only rows they created. They cover concurrency,
lost responses, wrong amounts, authorization-only cards, price snapshots, balanced
ledger, repeated disclosure, refunds and durable worker claims.

Real Appmax sandbox validation requires configured merchant credentials, installation
and panel webhook. No claim of an external payment is made by fixture tests. Test
approved/captured, pre-authorized, declined and unavailable card scenarios, plus
approved and pending Pix, using the official sandbox documentation.

Sources: [Own-store setup](https://docs.appmax.com.br/guides/meus-tokens),
[Appmax JS](https://docs.appmax.com.br/guides/appmax-js),
[panel webhooks](https://docs.appmax.com.br/guides/webhooks-painel),
[installments](https://docs.appmax.com.br/api-reference/payments/parcelas),
[order totals](https://docs.appmax.com.br/api-reference/orders/calculo-valor).
