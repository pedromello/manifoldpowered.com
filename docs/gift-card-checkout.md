# Gift card checkout

Gift cards use the common buyer order and payment flow. The email delivery
integration is selected with `GIFT_CARD_PROVIDER=api`; Stripe test checkout is
available for homologation. Payment configuration and gift card delivery
configuration are separate. See [Payment providers](payment-providers.md) and
the [email delivery runbook](gift-card-email-delivery.md).

## Buyer flow

1. Browse `/store/gift-cards`. The public catalog reads enabled, available products
   from the database; it never calls the supplier from the browser.
2. Sign in with an activated account and select a product. The server snapshots
   the product, BRL price and account email when creating the order. Prices and
   recipient email cannot be supplied by the buyer request.
3. At `/checkout/:id`, verify the account email through an email challenge if
   required, enter the recipient name and any required document, and explicitly
   confirm the delivery address before payment. Recipient identity is encrypted.
   An email change requires a new unpaid order; it cannot redirect an existing
   purchase to another address.
4. Complete payment. A browser return or webhook alone is not payment proof;
   the payment worker retrieves and validates the remote payment before queuing
   gift card fulfillment. Stripe must use test credentials.
5. An operator sends paid orders through `/backoffice/gift-cards`. Acceptance by
   the supplier means processing. Tracking status `3` confirms delivery by email;
   status `7` stops tracking and requires support review. Other numeric statuses
   remain pending.
6. Follow delivery in `/library/gift-cards` or `/library/orders`. These pages
   refresh database state only. Email orders show the snapshotted address and
   delivery state, with no reveal button, redeemable code or delivery link.

The usual fulfillment states are `QUEUED → SUBMITTING → PROCESSING → DELIVERED`.
`CANCELLED` and `REVIEW` require operator attention. Payment and delivery are
tracked separately; a paid order does not imply a delivered gift card. Buyers
must not pay again to recover delivery.

## API and recovery boundaries

- `GET /api/v1/gift-cards`: public catalog and payment checkout availability.
- `GET/POST /api/v1/orders`: private history and server-priced order creation.
- `GET/POST /api/v1/orders/:id`: private detail, payment reconciliation and safe cancellation.
- `POST /api/v1/orders/:id/recipient`: strict `{name, document?, confirmed: true}`;
  derives the verified email on the server and refuses changes after payment starts.
- `GET/POST /api/v1/orders/:id/quote` and `POST /api/v1/orders/:id/payment`:
  quote reservation and payment submission; payment also enforces recipient confirmation.
- `GET /api/v1/gift-card-orders` and `GET /api/v1/gift-card-orders/:id`:
  private gift card history and delivery details.

Private order responses are not cached and check ownership. Idempotency keys,
immutable order snapshots and database locks protect retries and concurrent
requests. Delivery uses the gift card order ID as a stable request reference.
An uncertain submission is tracked by that same reference; it is never reset or
automatically posted again. Refunds and disputes stop pending fulfillment or
require review if submission already began.

## Homologation and legacy compatibility

Deployed homologation uses explicit `APP_ENV=hml`, `PURCHASES_ENABLED=true`,
sandbox payment configuration and `GIFT_CARD_PROVIDER=api`. Live production
payments remain blocked. Homologation currently uses manual backoffice actions;
no automatic gift card schedule is activated.

Existing synthetic `CODE` orders retain their reveal endpoint, first-disclosure
audit and deterministic nonredeemable demo codes. The local
`npm run gift-cards:seed -- --confirm-database=local_db` command is only for these
legacy visual fixtures; it neither creates email deliveries nor proves payment.
The simulator remains restricted to development and tests.

Fixture tests cover payment and delivery boundaries without external credentials.
Real provider authentication, catalog mapping, submission, tracking and inbox
receipt still require authorized homologation credentials and private contract
verification. Passing local tests does not establish an external round trip.
