# Phase 0 — Legal & Financial Groundwork

Blocking work that must complete before payment/ledger code ships. Nothing in
Phase 1+ is safe to launch (though it is safe to _build_) until items 1–4 close.

Status key: [ ] not started · [~] in progress · [x] done

---

## 1. Payment processor approval [ ]

**Deliverable:** written approval to process the digital game/gift card category
under the model described in `business-description.md`.

- [ ] Submit `business-description.md` to Stripe. Ask explicitly: _"Please
      confirm our account is approved for the sale of branded digital gift cards
      under this model."_ Get it in writing — a support ticket reply is fine, a
      verbal from sales is not.
- [ ] Ask specifically whether the affiliate storefront model requires Connect,
      or whether commission payouts as an ordinary expense are acceptable on a
      standard account. (Expected: standard account is fine. Confirm it.)
- [ ] Apply to at least one backup in parallel — Paddle, Adyen, or a
      games-vertical specialist. Do not launch single-threaded on one processor
      in a high-risk category; deplatforming mid-growth is the single largest
      existential risk to this MVP.
- [ ] Record reserve/rolling-reserve terms offered by each. High-risk categories
      often carry a rolling reserve; this directly affects your cash flow and
      whether a 30-day commission hold is even affordable.

**Do not proceed to launch on a "they haven't said no" basis.** Silence is not
approval, and a category violation discovered post-launch means frozen funds
plus undelivered orders you have already been paid for.

## 2. Reloadly supply agreement [ ]

Questions to get answered in writing before integrating:

- [ ] Does our agreement permit resale to consumers via affiliate-branded
      storefronts under our own brand? Any restriction on white-labelling?
      (Reloadly markets itself as a reseller-enablement API, so this is likely
      yes — get it confirmed in writing anyway.)
- [ ] **Dead/invalid code liability.** Reloadly's published terms state refunds,
      exchanges and returns are _not applicable_ to digital products, with a
      narrow exception where we can show publisher confirmation that the code
      was redeemed before delivery. Confirm the exact claim process, window, and
      evidence standard — and assume most bad codes are our loss.
- [ ] Is there an API SLA? Documented behaviour when an order call fails or
      times out mid-transaction — is a timed-out order ever chargeable to us,
      and how do we reconcile an ambiguous order state?
- [ ] Territorial restrictions on where we may sell, and confirmation that US
      and Brazil consumer sales are permitted.
- [ ] Discount/commission structure per product, and whether discounts are
      guaranteed for a period or can move without notice. **This is our entire
      gross margin** — if a product discount drops after we set a retail price,
      we absorb it.
- [ ] Prepaid wallet mechanics: minimum balance, top-up settlement time,
      supported funding currencies, whether balance is refundable on exit, and
      what happens to in-flight orders if balance runs out mid-day.
- [ ] Volume commitments or tiering thresholds.

**Working-capital note (now sharper):** Reloadly operates a **prepaid wallet**
— we fund before we sell, with no credit terms. Card settlement is typically
T+2 to T+7, and any rolling reserve extends that. So we float the entire
inventory cost plus the settlement gap. Model this before launch; it is the most
common way a marketplace MVP dies with healthy-looking revenue. A wallet
auto-top-up threshold and low-balance alerting are launch requirements, not
nice-to-haves — an empty wallet means paid orders we cannot fulfil.

## 3. Entity and tax posture [ ]

Take these to an accountant in your incorporation jurisdiction. Answers change
the data model, so close this before Phase 1 migrations are finalised.

- [ ] Confirm the entity and where it is incorporated.
- [ ] VAT/OSS/sales-tax: where are we registered, what are the thresholds, and
      does selling prepaid codes cross-border change the place-of-supply
      treatment? (Digital goods rules commonly tax at the _consumer's_
      location — this drives what we must collect and store at checkout.)
- [ ] Are affiliate commissions reportable income requiring tax-ID collection
      and annual reporting? Determine per affiliate jurisdiction and set the
      reporting threshold.
- [ ] **Schema impact:** if tax IDs and legal addresses are required, they must
      exist on `PayoutAccount` from the first migration, encrypted at rest, and
      be excluded from every `filterOutput` path.
- [ ] Confirm treatment of the 30-day commission hold — accrued liability vs.
      unearned. Affects revenue recognition and the ledger account structure.

## 4. Document set [ ]

Draft with counsel. `storefront-owner-agreement-termsheet.md` in this directory
is the input brief for the affiliate agreement — hand it to the lawyer rather
than starting from a blank page.

- [ ] **Consumer Terms of Sale** — Manifold as seller of record; affiliate
      storefronts explicitly disclosed as marketing surfaces operated under
      Manifold's terms.
- [ ] **Refund Policy** — non-refundable once revealed; 14-day window while
      unrevealed; auto-refund on supplier failure. Must be linked pre-purchase
      and acknowledged at reveal.
- [ ] **Storefront Owner (Affiliate) Agreement** — see term sheet.
- [ ] **Privacy Policy** — must state affiliates receive aggregate data only.
- [ ] **Acceptable Use / storefront content rules** — you are lending your brand
      and your merchant account to user-branded pages; you need takedown rights.

## 5. Decision log

Record here as each closes, with date and evidence link:

| Decision                         | Outcome | Date | Evidence |
| -------------------------------- | ------- | ---- | -------- |
| Processor approval (primary)     |         |      |          |
| Processor approval (backup)      |         |      |          |
| Connect required?                |         |      |          |
| Rolling reserve terms            |         |      |          |
| Reloadly resale permitted        |         |      |          |
| Dead-code liability              |         |      |          |
| Discount stability / margin      |         |      |          |
| Wallet float requirement         |         |      |          |
| VAT/place-of-supply treatment    |         |      |          |
| Affiliate tax reporting required |         |      |          |

---

## Standing constraint: protect the affiliate characterisation

The affiliate model holds only while it is true in substance. As of today
`StoreGameOverride` carries visibility only — storefront owners curate which
titles appear but **cannot set prices**. That single fact is the strongest
evidence that they are marketers rather than sellers.

Before shipping any of the following, re-confirm the legal position with
counsel, because each one moves storefront owners toward being sellers — which
would pull you into marketplace, payment-facilitator, and per-seller tax
obligations:

- Per-store price overrides or storefront-set discounts.
- Letting storefront owners list inventory they source themselves.
- Giving storefront owners access to consumer identity or contact data.
- Letting storefront owners handle consumer support, refunds, or disputes.
- Custom domains presented as an independent business rather than as "powered by
  Manifold".
