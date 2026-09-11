ALTER TYPE "SteamImportAttemptOutcome" ADD VALUE 'CACHE_HIT';
ALTER TYPE "SteamImportAttemptOutcome" ADD VALUE 'CACHED_FAILURE';
ALTER TYPE "SteamImportAttemptOutcome" ADD VALUE 'SHARED_IN_PROGRESS';
ALTER TYPE "SteamImportAttemptOutcome" ADD VALUE 'CAPACITY_UNAVAILABLE';
ALTER TYPE "SteamImportAttemptOutcome" ADD VALUE 'SKIPPED_MANAGED';

-- Logical game reference only; no foreign keys.
CREATE TABLE "steam_refreshes" (
  "id" TEXT NOT NULL,
  "steam_app_id" VARCHAR(20) NOT NULL,
  "game_id" TEXT,
  "state" TEXT NOT NULL DEFAULT 'IDLE',
  "last_completed_at" TIMESTAMP(3),
  "next_allowed_at" TIMESTAMP(3),
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "error_name" TEXT,
  "error_message" TEXT,
  "regional_outcomes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "steam_refreshes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "steam_refreshes_steam_app_id_key" ON "steam_refreshes"("steam_app_id");
CREATE INDEX "steam_refreshes_lease_expires_at_idx" ON "steam_refreshes"("lease_expires_at");
