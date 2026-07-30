# Storefront Owner (Affiliate) Agreement — Term Sheet

> Not a contract. This is the drafting brief to hand to counsel, capturing the
> commercial terms and the characterisation the platform's compliance posture
> depends on. Each term maps to a system behaviour — the contract and the code
> must not drift apart.

## Parties and characterisation

- Manifold (<LEGAL ENTITY>) — seller and merchant of record.
- Storefront Owner — an independent marketing affiliate. Not an employee, agent,
  partner, joint venturer, or reseller.

The agreement must state plainly that the Storefront Owner:

- takes no title to any product at any time;
- has no authority to bind Manifold or to make representations on its behalf;
- is not party to any contract of sale with a consumer;
- may not describe themselves as the seller, merchant, or retailer.

## Commercial terms

| Term             | Value                              | System behaviour                   |
| ---------------- | ---------------------------------- | ---------------------------------- |
| Commission rate  | <FILL>% of net sale value          | `LedgerEntry.affiliate_commission` |
| Commission basis | Net of tax, refunds, supplier cost | Computed at fulfilment             |
| Hold period      | 30 days from payment               | Maturation job                     |
| Payout schedule  | Monthly, matured balances only     | `Payout` batch                     |
| Minimum payout   | <FILL>                             | Blocks payout below threshold      |
| Payment method   | <FILL>                             | —                                  |
| Currency / FX    | <FILL>, FX cost borne by <FILL>    | —                                  |

## Terms the platform's risk position depends on

**Pricing control.** Manifold sets all prices. The Storefront Owner has no right
to set, alter, discount, or bundle prices. _(Enforced today by
`StoreGameOverride` carrying visibility only.)_

**No funds handling.** All consumer payments are collected by Manifold. The
Storefront Owner has no right to collect payment, request payment off-platform,
or direct consumers to any other payment method. Off-platform payment collection
is a material breach and grounds for immediate termination and forfeiture.

**Commission is contingent, not earned at sale.** Commission accrues on payment
but becomes payable only after the hold period expires with no refund, dispute,
or chargeback on the underlying order. This must be drafted as a condition
precedent to payment, not as a debt subject to later deduction — the distinction
matters if an affiliate becomes insolvent.

**Clawback.** Where commission has been paid and the underlying sale is later
refunded or charged back, the amount is recoverable, and Manifold may set it off
against future commissions. Negative balances carry forward.

**Fraud forfeiture.** Commission on any order Manifold determines in good faith
to be fraudulent, self-dealing, or the product of prohibited traffic is
forfeited in full, whether or not matured.

**Prohibited promotion.** No spam, no misrepresentation of Manifold or the
goods, no trademark bidding on Manifold's marks, no incentivised or bot traffic,
no promotion to minors, no promotion in territories where Manifold does not
sell, no claims about code region or validity beyond the catalogue text.

**Verification and tax.** No payout until identity verification and tax
documentation are complete. Manifold may withhold where required by law.

**Data.** The Storefront Owner receives aggregate sales data only, never
consumer personal data, and never product codes. Any incidental receipt must be
reported and deleted.

**Termination.** Either party on <FILL> days' notice; Manifold immediately for
breach, fraud, or legal/processor requirement. On termination, matured
commissions are paid on the normal schedule; unmatured commissions <FILL —
decide: forfeited, or paid on maturation>. Storefront goes offline immediately.

**Suspension.** Manifold may suspend a storefront and withhold payouts pending
investigation, for up to <FILL> days.

**Amendment.** Manifold may amend commission rates and programme terms on <FILL>
days' notice; continued participation is acceptance.

**Liability.** No guarantee of sales, traffic, or availability. Manifold's
aggregate liability capped at commissions paid in the preceding <FILL> months.

**Governing law.** <FILL>.

## Open decisions for you

1. Commission rate, and whether it varies by volume tier or title.
2. Unmatured commission on termination — forfeited or paid out? Forfeiture is
   cleaner operationally and a stronger anti-abuse lever; paying out is fairer
   and better for recruiting affiliates. Recommend: pay on maturation for
   voluntary termination, forfeit for termination for cause.
3. Whether affiliates may operate custom domains. Recommend: not at MVP — a
   custom domain badly weakens the "marketing surface, not independent seller"
   characterisation, for little launch value.
4. Whether to cap the number of storefronts per user (recommend: yes, one at
   MVP — multiple storefronts per identity is a standard laundering pattern).
