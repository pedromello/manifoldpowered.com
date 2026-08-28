CREATE TABLE "game_external_offers" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(19,4),
    "original_amount" DECIMAL(19,4),
    "discount_percent" INTEGER,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_external_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "game_external_offers_game_id_idx"
ON "game_external_offers"("game_id");

CREATE UNIQUE INDEX "game_external_offers_game_id_provider_country_key"
ON "game_external_offers"("game_id", "provider", "country");

ALTER TABLE "game_external_offers"
ADD CONSTRAINT "game_external_offers_game_id_fkey"
FOREIGN KEY ("game_id") REFERENCES "games"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
