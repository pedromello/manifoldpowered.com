-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_account_id" VARCHAR(255),
    "payout_currency" VARCHAR(3) NOT NULL,
    "label" VARCHAR(255),
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_store_id_key" ON "payout_accounts"("store_id");
