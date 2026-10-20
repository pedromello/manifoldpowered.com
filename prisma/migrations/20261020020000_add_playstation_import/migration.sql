ALTER TYPE "GameLocalizationSource" ADD VALUE 'PLAYSTATION';
ALTER TABLE "games" ADD COLUMN "playstation_product_id" VARCHAR(64);
CREATE UNIQUE INDEX "games_playstation_product_id_key" ON "games"("playstation_product_id");
ALTER TABLE "game_external_offers" ADD COLUMN "expires_at" TIMESTAMPTZ(3);
CREATE TABLE "playstation_refreshes" (
  "id" TEXT NOT NULL, "product_id" VARCHAR(64) NOT NULL, "game_id" TEXT,
  "state" TEXT NOT NULL DEFAULT 'IDLE', "last_completed_at" TIMESTAMP(3),
  "next_allowed_at" TIMESTAMP(3), "lease_token" TEXT, "lease_expires_at" TIMESTAMP(3),
  "error_name" TEXT, "error_message" TEXT, "regional_outcomes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "playstation_refreshes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "playstation_refreshes_product_id_key" ON "playstation_refreshes"("product_id");
CREATE INDEX "playstation_refreshes_game_id_idx" ON "playstation_refreshes"("game_id");
CREATE INDEX "playstation_refreshes_lease_expires_at_idx" ON "playstation_refreshes"("lease_expires_at");
CREATE TABLE "playstation_import_attempts" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "product_id" VARCHAR(64) NOT NULL,
  "outcome" VARCHAR(32) NOT NULL DEFAULT 'PENDING', "regional_outcomes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "playstation_import_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playstation_import_attempts_user_id_created_at_idx" ON "playstation_import_attempts"("user_id","created_at");
UPDATE "users" SET "features" = array_append("features", 'import:playstation_game')
WHERE 'import:nintendo_game' = ANY("features") AND NOT ('import:playstation_game' = ANY("features"));
