# Manifold — Business Description (Payment Processor Application)

> Purpose: the disclosure text submitted to payment processors (Stripe, and any
> backup provider) when applying for approval to sell digital game/gift card
> codes. Written to be handed over as-is. Keep it accurate — if the product
> changes, update this file _before_ the change ships.

## Summary

Manifold is a digital goods storefront operated by <LEGAL ENTITY NAME>,
incorporated in <JURISDICTION>. Manifold sells branded digital gift cards to
consumers at manifoldpowered.com and on branded sub-storefronts hosted on the
same platform. Launch markets are the United States and Brazil.

**Manifold is the seller and merchant of record for every transaction.** There
is no third-party seller. All consumer payments are collected by Manifold, all
inventory is purchased by Manifold, and all consumer support, refunds, and
disputes are handled by Manifold.

## Inventory sourcing

All gift cards are sourced from Reloadly (https://www.reloadly.com/), a
regulated digital gift card and payments distributor, under a commercial
agreement. Manifold funds a prepaid balance with Reloadly and draws each code
from Reloadly's API at the moment of fulfilment, taking title to the code on
purchase. Manifold does not accept user-supplied, user-uploaded, or user-traded
codes at any point — there is no consumer-to-consumer or seller-to-consumer
resale channel on the platform, and no secondary market.

## The affiliate storefront model

Registered users may create a branded storefront on Manifold and curate which
titles from Manifold's catalogue appear on it. These users are **affiliates
(marketing partners)**, not sellers. Specifically:

- Affiliates never take title to any inventory.
- Affiliates never set, alter, or discount prices. Pricing is set solely by
  Manifold and is identical across every storefront.
- Affiliates never receive, hold, or route consumer funds. Checkout runs
  entirely through Manifold's own processor account.
- Affiliates have no contractual relationship with the consumer. The consumer's
  contract of sale is with Manifold, and Manifold's Terms of Sale are presented
  at checkout on every storefront.
- Affiliates receive no consumer personal data — they see aggregate sales
  figures only.
- Affiliates earn a percentage commission, paid by Manifold out of Manifold's
  own revenue, as an ordinary marketing expense. Commission is held for 30 days
  after the sale and is forfeited/clawed back if the underlying sale is refunded
  or charged back.

Functionally this is a standard affiliate/referral programme with a
white-labelled landing surface. It is not a marketplace: Manifold does not
onboard sellers, does not split payments, and does not act as a payment
facilitator or intermediary for any third party.

## Fulfilment

1. Consumer pays Manifold at checkout.
2. On payment confirmation, Manifold places an order against Reloadly's Gift
   Cards API and retrieves the redeem code/PIN.
3. If the supplier call succeeds, the code is assigned to the order and revealed
   to the consumer (in-account reveal plus email). Reveal time is recorded.
4. If the supplier call fails, the order is auto-refunded in full and no code is
   delivered.

Typical delivery time: under 60 seconds. Nothing is shipped physically.

## Refunds and dispute handling

Codes are non-refundable **once revealed**, disclosed prominently pre-purchase
and re-confirmed with an explicit click-through at the reveal step. Unrevealed
orders are refundable within 14 days, no questions asked. Supplier failures are
refunded automatically.

Dispute evidence retained per order: authenticated account identity, IP and
device at purchase, the pre-purchase non-refundability acceptance, the reveal
timestamp, and the delivery email receipt.

## Fraud controls

- Purchases require a registered, email-activated account. No guest checkout.
- Velocity limits per account, per card, and per IP.
- Manual review hold on the first order placed through any newly created
  storefront.
- Billing-country vs. code-region mismatch blocks.
- Minimum payout threshold and a 30-day commission hold, making the affiliate
  channel unattractive as a laundering route.
- Affiliates are identity-verified and tax-documented before any payout.

## Expected volumes

- Average order value: <FILL>
- Expected monthly volume at launch: <FILL>
- Expected monthly volume at 12 months: <FILL>
- Target chargeback rate: below <FILL>%

## Contacts

- Legal entity: <FILL>
- Registered address: <FILL>
- Tax/VAT registration: <FILL>
- Compliance contact: <FILL>
