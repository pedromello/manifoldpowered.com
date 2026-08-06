-- A ledger entry's owner becomes polymorphic, and stops being a user.
--
-- owner_id previously held a User id — the outlet's owner, resolved at sale
-- time. The outlet itself is now the payee: it holds the balance and the payout
-- account, so a commission survives the outlet changing hands.
--
-- Hand-written rather than left as Prisma generated it. The generated version
-- adds owner_type and stops, which would leave every existing commission
-- pointing at a user while the code reads it as a store — money silently
-- attributed to the wrong party, with nothing failing.

-- DropIndex
DROP INDEX "ledger_entries_owner_id_account_type_currency_matures_at_idx";

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "owner_type" VARCHAR(50);

-- Backfill. Every owned entry was written by library.acquireGame against a Sale
-- (source_type = 'SALE'), and a commission is only written when the sale had an
-- outlet, so Sale.store_id is guaranteed non-null exactly where an owner exists.
-- A reversal copies its original's source, so the same join covers those too.
UPDATE "ledger_entries" le
SET "owner_type" = 'STORE', "owner_id" = s."store_id"
FROM "sales" s
WHERE le."source_type" = 'SALE'
  AND le."source_id" = s."id"
  AND le."owner_id" IS NOT NULL
  AND s."store_id" IS NOT NULL;

-- Anything still owned but untyped could not be mapped to an outlet, which
-- means money attributed to nobody. Stop the deploy rather than let it through:
-- the table is append-only, so there is no UPDATE available to repair it later.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ledger_entries"
    WHERE "owner_id" IS NOT NULL AND "owner_type" IS NULL
  ) THEN
    RAISE EXCEPTION 'ledger_entries has owned rows that could not be mapped to a store';
  END IF;
END $$;

-- CreateIndex
CREATE INDEX "ledger_entries_owner_type_owner_id_account_type_currency_ma_idx" ON "ledger_entries"("owner_type", "owner_id", "account_type", "currency", "matures_at");
