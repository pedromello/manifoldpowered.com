ALTER TYPE "GameStatus" ADD VALUE 'ONLY_DISPLAY';

ALTER TABLE "games" ALTER COLUMN "studio_id" DROP NOT NULL;

ALTER TABLE "games"
  ADD COLUMN "steam_price" DECIMAL(19,4),
  ADD COLUMN "steam_original_price" DECIMAL(19,4),
  ADD COLUMN "steam_discount_percent" INTEGER,
  ADD COLUMN "steam_price_currency" VARCHAR(3),
  ADD COLUMN "steam_price_captured_at" TIMESTAMP(3);

CREATE TYPE "SteamImportAttemptOutcome" AS ENUM (
  'PENDING',
  'SUCCESS',
  'NOT_FOUND',
  'SERVICE_ERROR',
  'INVALID_DATA',
  'BLOCKED_ADULT'
);

CREATE TABLE "steam_import_attempts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "steam_app_id" VARCHAR(20) NOT NULL,
  "outcome" "SteamImportAttemptOutcome" NOT NULL DEFAULT 'PENDING',
  "content_descriptor_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "content_descriptors_present" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "steam_import_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "steam_import_attempts_user_id_created_at_idx"
  ON "steam_import_attempts"("user_id", "created_at");
CREATE INDEX "steam_import_attempts_steam_app_id_idx"
  ON "steam_import_attempts"("steam_app_id");
