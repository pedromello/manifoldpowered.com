# Payments — Ledger Architecture

How money movements are recorded, and the one rule everything else depends on.

Delivery plan and task status live in [`payments-tasks.md`](./payments-tasks.md).
The pricing path — how a game gets a price in the visitor's currency — is in
[`payments-architecture.md`](./payments-architecture.md). This document covers
the ledger only.

---

## The rule

**A set of entries is rejected unless it sums to zero within every currency it
touches.**

That is the whole design. Money is never created or destroyed by a write, only
moved between accounts, so a bug that loses money fails at write time instead of
surfacing in a payout three weeks later. Everything below exists to keep that
rule true.

Two consequences worth stating plainly:

- **Nothing is ever updated.** A correction is a new, negated set of entries.
  `LedgerEntry` has no `updated_at` for the same reason `Sale` and
  `AdminActionLog` don't.
- **Balances are never stored.** A balance is a `SUM` over rows, computed on
  read. A stored balance is a second source of truth that can drift from the
  entries, and reconciling the two is a problem this design simply doesn't have.

## Sign convention

**Positive is money the platform received or holds. Negative is money it owes
or has spent.**

One sale of 100.00 — a code that cost 70.00, with 10.00 of affiliate
commission:

| `account_type`         | `owner_id` |    `amount` |
| ---------------------- | ---------- | ----------: |
| `CONSUMER_PAYMENT`     | —          | `+100.0000` |
| `SUPPLIER_COST`        | —          |  `-70.0000` |
| `AFFILIATE_COMMISSION` | outlet     |  `-10.0000` |
| `PLATFORM_REVENUE`     | —          |  `-20.0000` |
|                        |            |  `0.0000` ✓ |

A single signed column cannot make "cash in is positive" and "commission owed
is positive" both true — under a zero-sum constraint the two have opposite
signs, because one is an asset and the other a liability. This codebase keeps
cash-in positive, which means **a commission balance is negative while we owe
it.**

Every user-facing read therefore flips the sign, and does it in exactly one
place: `ledger.payableBalancesFor()`. Nothing else should negate a balance by
hand — one call site forgetting to would pay an affiliate backwards.

```ts
await ledger.balancesFor("STORE", outletId); //  -10.0000  what the ledger holds
await ledger.payableBalancesFor("STORE", outletId); //  +10.0000  what we owe them
```

A payout run wants both the sign flip _and_ the hold, so it calls
`maturedPayableBalancesFor()`. That function exists specifically because the
obvious name for the number it needs — `maturedBalancesFor` — returns the raw
ledger sign, and a payout run reaching for the obviously-named function and
transferring a negative amount is the worst bug this model could ship.

## Balances are per currency

An outlet can hold a BRL balance and a USD balance at the same time. They are
never added together, and `balancesFor` returns one row per currency rather than
a single number, so there is no shape in which they could be.

The zero-sum rule is per currency too. A set holding `USD +100` and `BRL -100`
is **unbalanced**, not balanced — summing across currencies would hide exactly
the error the rule exists to catch. Converting between them is itself a pair of
entries carrying the rate that produced them.

## Who reads what

Every function above answers "what is one payee owed", which is why they all
take an owner pair and `balancesFor` refuses a missing one. The platform's own
books are the opposite question, and its three accounts — `CONSUMER_PAYMENT`,
`SUPPLIER_COST`, `PLATFORM_REVENUE` — are exactly the ones that may not carry an
owner, so none of them are reachable through an owner-scoped read.

`platformTotals({ from, to })` is that read: one row per currency, grouped by
account rather than filtered by owner, signed the way a person expects. It
counts owned rows too. Commission is a platform expense regardless of which
outlet it belongs to, and an income statement missing its largest cost line
would not add up against the gross beside it.

Four audiences read sale data, and each sees a different amount of the buyer:

| Audience | Endpoint                          | Buyer                    |
| -------- | --------------------------------- | ------------------------ |
| Buyer    | `GET /api/v1/user/purchases`      | themselves               |
| Outlet   | `GET /api/v1/stores/:slug/sales`  | `buyer_ref` pseudonym    |
| Studio   | `GET /api/v1/studios/:slug/sales` | no buyer field at all    |
| Admin    | `GET /api/v1/backoffice/revenue`  | no per-sale rows, totals |

`buyer_ref` is `sha256(user_id:store_id)` truncated. Salted by the outlet, so
the same buyer produces a different ref at every outlet and two operators
comparing notes cannot correlate them; derived from a UUID, so there is no id
space to brute-force and no server secret is needed. Repeat-customer analysis
still works within one outlet, which is the legitimate use the raw buyer id was
serving before it was removed.

A studio gets no buyer field at all — not even the pseudonym. A studio has no
use for telling one buyer from another, and the cheapest way to keep consumer
data out of a second party's hands is not to send it.

## Reversal, and why `matures_at` is copied

A commission is held for 30 days so refunds and chargebacks can resolve
(`matures_at`). `reverse()` writes the mirror image of a set — same accounts,
same currency, same rate snapshot, negated amounts — with each new row naming
the row it cancels via `reverses_entry_id`.

It also copies the original's `matures_at`, which is load-bearing:

```
matured balance = SUM(amount) WHERE matures_at IS NULL OR matures_at <= now
```

A reversal with a null hold would count as immediately available while the
original was still held. The matured balance would then show the commission as
payable with nothing offsetting it — a clawback that silently claws nothing
back. Copying the hold makes the pair cancel at the same instant.

A set can only be reversed once, and a reversal cannot itself be reversed.
Further corrections are new balanced sets. The unique index on
`reverses_entry_id` is what actually enforces the first rule: `reverse()` checks
before writing, but two concurrent chargeback handlers would both pass that
check, and a commission clawed back twice leaves the affiliate owing us money
with no `UPDATE` available to repair it.

**`isSourceReversed()` is introspection, not a payability test.** It only sees
corrections made through `reverse()`; one written as a fresh `ADJUSTMENT` set
carries no back-pointer and is invisible to it. The number that is always right
is the balance — a reversal negates the original _and_ copies its `matures_at`,
so a cancelled commission already nets to zero in `maturedPayableBalancesFor`
without anyone having to ask.

## Referencing the source

`source_type` + `source_id` is a polymorphic reference, the same shape as
`AdminActionLog.target_type`/`target_id`. It points at a `Sale` today and will
point at an `Order` once checkout exists.

`source_type` is deliberately **not** a database enum: extending it must not
cost a migration. The allowed values live in `LEDGER_SOURCE_TYPES` in
`models/ledger.ts`, which is where referential integrity lives in a schema with
no foreign keys.

`account_type` **is** an enum, because a new account is a real accounting
decision rather than a data-shape change, and the database is the only place
integrity can be enforced without foreign keys. Adding one is a one-line
`ALTER TYPE ADD VALUE`.

## The chart of accounts

| Account                | Meaning                                         |
| ---------------------- | ----------------------------------------------- |
| `CONSUMER_PAYMENT`     | Gross collected from a buyer; funds a sale      |
| `SUPPLIER_COST`        | What the delivered code cost us                 |
| `AFFILIATE_COMMISSION` | Owed to an outlet, held until `matures_at`      |
| `PLATFORM_REVENUE`     | What is left for the platform                   |
| `PAYOUT`               | A commission balance actually sent to an outlet |

Deliberately absent, and why:

- **Tax withholding accounts** — the tax posture
  ([#175](https://github.com/pedromello/manifoldpowered.com/issues/175)) is
  unanswered, and the platform is global, so anything fiscal has to be generic
  rather than modelled for one country. The ledger records facts; tax rules
  decide what to do with those facts. Adding the accounts later does not reshape
  anything.
- **A supplier prepaid wallet** — Reloadly runs on a prefunded balance, so
  top-ups and draws deserve their own accounts. They need a platform cash
  account to balance against, and neither is writable until checkout exists.
- **A processor reserve** — high-risk categories often carry a rolling reserve,
  but the terms aren't known yet (`docs/legal/phase-0-checklist.md`).

## Rounding is refused, not applied

Storage is `Decimal(19,4)`. An amount carrying more scale than that is
**rejected** rather than rounded.

Rounding at write time can turn a set that validated as balanced into one that
lands unbalanced — four entries each shaved by a hundredth of a cent net to
something that is no longer zero. Refusing the write pushes the decision back to
the caller, who knows which side should absorb the remainder.

## What a caller writes

```ts
await ledger.record({
  source_type: "SALE",
  source_id: sale.id,
  entries: [
    { account_type: "CONSUMER_PAYMENT", amount: gross, currency: "BRL" },
    { account_type: "SUPPLIER_COST", amount: cost.negated(), currency: "BRL" },
    {
      account_type: "AFFILIATE_COMMISSION",
      owner_type: "STORE",
      owner_id: store.id,
      amount: commission.negated(),
      currency: "BRL",
      matures_at: maturityFor(sale),
    },
    {
      account_type: "PLATFORM_REVENUE",
      amount: revenue.negated(),
      currency: "BRL",
    },
  ],
});
```

Every row lands under one generated `entry_group_id`, in a single statement, or
none of them do. A partially written set would break the invariant permanently,
and there is no `UPDATE` available to repair it.

`sumByCurrency()` is exported and pure, so a caller assembling a set can check
it balances before attempting the write.

## Which accounts may name a payee

`AFFILIATE_COMMISSION` and `PAYOUT` must carry an `owner_type` and `owner_id`.
Every other account is the platform's own and must carry neither.

**The payee is an outlet, not a person.** A `Store` holds the balance and the
payout account, so a commission survives the outlet changing hands and a payment
goes to the account registered against the outlet rather than to whoever owns it
today. `owner_type` is polymorphic — the same shape as `source_type` — so paying
a studio later costs no migration.

Both directions are enforced in `record()`, and both matter. An unowned account
naming a storefront owner would be a database row asserting that an affiliate
received consumer funds — the one fact the affiliate characterisation depends on
never being true (`docs/legal/phase-0-checklist.md`). An owned account with _no_
owner is a liability owed to nobody: balances are looked up by owner, so the row
would sit in the books invisible to every read path.

With no foreign keys, `owner_id` is also checked against `User` before the
write, for the same reason currency codes are — an id that matches nothing
becomes a commission that never appears in any statement or payout.

## What is not modelled here

- **Idempotency.** Nothing stops the same sale being recorded twice; a
  duplicated payment webhook would write a second balanced set and the affiliate
  would be owed double. `(source_type, source_id)` cannot simply be unique
  because reversals share it. This needs deciding before checkout writes to the
  ledger — see the open questions in `payments-tasks.md`.
- **Payout runs.** `maturedPayableBalancesFor` says what may be paid, but
  nothing moves money or writes the `PAYOUT` set that would settle it.

## Currencies the ledger will accept

Registered, or the base currency.

`models/pricing` deliberately lets the platform sell in USD before any currency
row exists, so localisation is purely additive. A ledger that disagreed would
leave an unconfigured install unable to record a single sale.

A registered but **disabled** currency is accepted too. Turning a currency off
stops us pricing in it; it does not un-happen the sales already made in it.
