# Gift card email delivery: homologation runbook

Use private runtime configuration for the generic `gift_card_provider` adapter.
Do not commit real hostnames, credentials, raw API responses or recipient data.
The configuration below is synthetic and deliberately cannot authenticate.
Catalog access can be checked separately from permission to issue gift cards.

## Private configuration

Apply migrations and generate the Prisma client before running the application.
Set these values in the deployment secret store, or an ignored local environment
file for development. Restart the server after configuration changes.

```dotenv
APP_ENV=hml
PURCHASES_ENABLED=true
PAYMENT_PROVIDER=stripe
PAYMENT_ENVIRONMENT=sandbox
STRIPE_SECRET_KEY=replace_with_private_stripe_test_key
STRIPE_WEBHOOK_SECRET=replace_with_private_test_webhook_secret
STRIPE_CHECKOUT_ORIGIN=https://hml.example.test
GIFT_CARD_PROVIDER=api
GIFT_CARD_PROVIDER_ENVIRONMENT=sandbox
GIFT_CARD_PROVIDER_BASE_URL=https://gift-card-provider.example/
GIFT_CARD_PROVIDER_USERNAME=replace_with_private_sandbox_username
GIFT_CARD_PROVIDER_PASSWORD=replace_with_private_sandbox_password
GIFT_CARD_PROVIDER_API_TOKEN=replace_with_private_catalog_and_order_token
GIFT_CARD_PROVIDER_TOKEN_SOURCE=configured
GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED=false
GIFT_CARD_PROVIDER_CONTRACT_VERIFIED=false
GIFT_CARD_RECIPIENT_ENCRYPTION_KEY=replace_with_a_private_random_64_hex_character_key
GIFT_CARD_PROVIDER_RESPONSE_MAPPING='{"products_path":"data.products","sku":"sku","name":"name","face_value":"face_value","fixed_currency":"BRL","value_unit":"major","cost":"cost","reference":"data.reference","status":"data.status"}'
```

`GIFT_CARD_PROVIDER_CONTRACT_VERIFIED=true` is an operator attestation, not a
test result. Catalog synchronization uses a separate read-only client and can
authenticate, validate and import catalog entries while this flag is false.
That client exposes no order-submission or tracking methods. Checkout and
fulfillment remain blocked until the flag is true, including cached clients
after the flag is revoked. Set it only after privately checking the actual sandbox contract:
login fields/response, product denomination versus acquisition cost, recipient
requirements, order request fields, accepted response, tracking reference and
status mapping. If the actual request contract differs from the adapter, update
the adapter and synthetic tests before enabling it. The response mapping does
not customize request bodies. The base URL must be an HTTPS origin with no
credentials, query, fragment or path prefix.

The login returns the bearer access token (`accessToken`, with an `expires`
timestamp), either at the root or inside `data`. An explicit invalid `data`
envelope is rejected rather than falling back to root fields. Confirm privately
which token the business endpoints require.
`GIFT_CARD_PROVIDER_TOKEN_SOURCE=configured` uses a separate private
`GIFT_CARD_PROVIDER_API_TOKEN` for catalog/order/tracking calls. Set the source
to `login` if the verified contract instead uses the current login token in those
fields; the separate API token is then unnecessary. Do not infer the source from
the Swagger placeholder. Neither token belongs in browser configuration or logs.
Read operations can refresh expired authentication once, rebuilding the business
token when needed; order submission is never repeated automatically.
Redact outbound HTTP telemetry: the API contract places the private API token
in catalog paths and tracking queries, and recipient details in request bodies.

The recipient encryption key must be 32 random bytes encoded as **64 hexadecimal
characters**. Keep it in private durable secret storage, consistent across the
application instances and redeployments. Losing or replacing it without a
migration makes existing encrypted recipient details unreadable. Recipient name
and optional document use authenticated encryption bound to the order ID;
the verified email is snapshotted separately for delivery. Set document-required
according to the verified contract, not the example default.

## Response mapping

`GIFT_CARD_PROVIDER_RESPONSE_MAPPING` is strict JSON with these fields. Paths use
dot notation. Identifier, name and currency paths are relative to each parent
product. With `variants_path`, denomination and cost paths are relative to each
variant object; otherwise they are relative to the product. Tracking paths are
relative to the full response. An empty `products_path` selects a root array.
The example above does not assert the actual response shape.

| Field                          | Meaning                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `products_path`                | Product array in the catalog response.                                            |
| `variants_path`                | Optional array of denomination records inside each product.                       |
| `sku`, `name`                  | Product identifier and display name.                                              |
| `face_value`                   | Gift card denomination; must not map acquisition cost here.                       |
| `currency` or `fixed_currency` | Currency field path, or fixed `BRL`; configure one.                               |
| `value_unit`                   | `major` for BRL decimal amounts, `minor` for integer cent amounts.                |
| `cost`                         | Optional acquisition-cost field path; uses the same value unit. Omit when absent. |
| `reference`, `status`          | Tracking reference and numeric status paths.                                      |
| `submit_reference`             | Optional accepted-reference path for submit responses; defaults to `reference`.   |

For example, a synthetic catalog with parent `id`/`label` and an `options` array
can map `variants_path` to `options`, `face_value` to `credit`, and `cost` to
`charged`. Each option produces one SKU-and-denomination entry. Empty option
arrays contribute no entries; malformed arrays or duplicate denominations reject
the sync. Separate arrays are never paired by position. Use the verified private
mapping for the actual service. Catalog-only configuration does not require
`reference` or `status`; the full fulfillment client still requires both.

The adapter accepts BRL products with positive denominations, rejects malformed
or duplicate entries, and strips raw response data. A failed sync preserves the
previous catalog. A successful sync marks missing products unavailable; newly
imported products remain disabled until reviewed and explicitly enabled.
Tracking maps `3` to delivered, `7` to cancelled, other numeric codes to pending,
and missing/unparseable status to unknown. A submit response only establishes
acceptance; tracking establishes delivery. No code or delivery link is retained.

## Manual homologation operations

Before opening `/backoffice/gift-cards`, run the existing feature backfill against
the intended homologation database so existing administrators receive
`read:gift_card:any` and `update:gift_card:any`. With the target database configured
privately in the runtime environment, use `npm run features:backfill:ci` (the local
`features:backfill` command loads `.env.development`). The backfill reconciles
existing admin roles; it does not turn a buyer account into an administrator.
The four buttons call the same bounded operations intended for future cron use:

1. **Sync catalog**: authenticate, import and validate products using the read-only
   catalog client. New entries remain disabled even while contract verification
   is pending. Review denominations and use **Enable sales** on the products
   approved for the test; enabling an entry does not bypass the checkout gate.
2. **Reconcile payments**: retrieve and validate pending payments. After a buyer
   confirms recipient details and completes Stripe test checkout, run this until
   the local order reports paid.
3. **Send paid orders**: process durable fulfillment jobs using each order's stable
   reference. Acceptance remains processing; do not expect an immediate code.
4. **Track deliveries**: process lookups due for an update. Pending/failed lookups
   are normally deferred by at least six hours, respecting a longer `Retry-After`.
   Delivered/cancelled orders stop tracking.

Payment/submission/tracking batches process at most five jobs or approximately
20 seconds of work per invocation. Repeat when work remains. Report counts describe
job processing, not proof of supplier delivery; inspect order state and generic
errors. Browser refresh reads the database and does not run these operations.

**Check one delivery now** permits an early lookup for a specific order in
development/homologation, with a one-minute cooldown. It requires an existing
submitted gift card job, does not issue a new card, and does not bypass payment
or ownership/administration controls. Keep the order ID from gift card history.

An unknown or failed submission may have reached the supplier. Preserve its
request reference and submission marker and reconcile through tracking. Never
clear those fields, delete its job/order, switch references or repost it to
recover a timeout. Cancelled deliveries and financial disputes require private
operational review; there is no automatic replacement or refund action here.

## Scheduling and validation boundary

No automatic scheduler is enabled for homologation, and `vercel.json` contains
no activated gift card schedules. Authenticated
`GET /api/v1/cron/gift-cards/:action` handlers are available for a future scheduler
and expose `sync-catalog`,
`reconcile-payments`, `submit-paid-orders` and `track-deliveries` through the same
operations. They require `Authorization: Bearer <CRON_SECRET>` with a private
secret of at least 32 characters and do not permit forced early lookups.
Activating a scheduler is a separate deployment decision. The requested future
catalog cadence is daily at 22:00 in `America/Sao_Paulo`; tracking eligibility is
stored per order at six-hour intervals.

Before declaring homologation complete, use authorized private credentials to
validate the contract/mapping, sync and enable one approved product, verify an
account email, confirm recipient details, complete Stripe test payment, reconcile,
submit once, observe tracking through a terminal status, and inspect the intended
inbox. Also check pending/unknown responses, cancellation and duplicate operations.
Record only redacted outcomes. Local synthetic tests or a successful catalog
read do not establish that this complete external delivery sequence has happened.
