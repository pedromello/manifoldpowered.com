-- CreateTable
CREATE TABLE "game_price_overrides" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_price_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_price_overrides_game_id_idx" ON "game_price_overrides"("game_id");

-- CreateIndex
CREATE INDEX "game_price_overrides_currency_idx" ON "game_price_overrides"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "game_price_overrides_game_id_currency_key" ON "game_price_overrides"("game_id", "currency");
