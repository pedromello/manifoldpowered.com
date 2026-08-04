-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('CONSUMER_PAYMENT', 'SUPPLIER_COST', 'AFFILIATE_COMMISSION', 'PLATFORM_REVENUE', 'PAYOUT');

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entry_group_id" TEXT NOT NULL,
    "account_type" "LedgerAccountType" NOT NULL,
    "owner_id" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "exchange_rate" DECIMAL(19,8),
    "exchange_rate_from_currency" VARCHAR(3),
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" TEXT NOT NULL,
    "matures_at" TIMESTAMP(3),
    "reverses_entry_id" TEXT,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reverses_entry_id_key" ON "ledger_entries"("reverses_entry_id");

-- CreateIndex
CREATE INDEX "ledger_entries_entry_group_id_idx" ON "ledger_entries"("entry_group_id");

-- CreateIndex
CREATE INDEX "ledger_entries_owner_id_account_type_currency_matures_at_idx" ON "ledger_entries"("owner_id", "account_type", "currency", "matures_at");

-- CreateIndex
CREATE INDEX "ledger_entries_source_type_source_id_idx" ON "ledger_entries"("source_type", "source_id");
