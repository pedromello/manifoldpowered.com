-- Index changes for ledger_entries, split out because 20260804223856 had
-- already been applied by a deployment and a migration cannot be edited once
-- it has run anywhere.
--
-- No column changes: only the indexes differ.

-- reverses_entry_id becomes unique so an entry can be cancelled exactly once.
-- models/ledger.reverse() checks before writing, but that check is
-- read-then-write: two concurrent chargeback handlers would both pass it and
-- claw the same commission back twice, and with no UPDATE available on an
-- append-only table a ledger wrong in that direction cannot be repaired.
DROP INDEX "ledger_entries_reverses_entry_id_idx";

CREATE UNIQUE INDEX "ledger_entries_reverses_entry_id_key" ON "ledger_entries"("reverses_entry_id");

-- The balance query groups by owner, account and currency, and the matured
-- variant adds a maturity filter on top. Carrying matures_at as the last column
-- serves both from one index, and makes the standalone index on matures_at dead
-- weight — no query filters on maturity without an owner, so nothing would ever
-- choose it.
DROP INDEX "ledger_entries_matures_at_idx";

DROP INDEX "ledger_entries_owner_id_account_type_currency_idx";

CREATE INDEX "ledger_entries_owner_id_account_type_currency_matures_at_idx" ON "ledger_entries"("owner_id", "account_type", "currency", "matures_at");
