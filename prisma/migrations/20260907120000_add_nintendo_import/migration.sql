ALTER TYPE "GameLocalizationSource" ADD VALUE 'NINTENDO';
ALTER TABLE "games" ADD COLUMN "nintendo_nsuid" VARCHAR(14);
CREATE UNIQUE INDEX "games_nintendo_nsuid_key" ON "games"("nintendo_nsuid");
CREATE TABLE "nintendo_import_attempts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "outcome" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "regional_outcomes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nintendo_import_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "nintendo_import_attempts_user_id_created_at_idx" ON "nintendo_import_attempts"("user_id", "created_at");
-- Nintendo entries remain catalog-only even through administrative updates.
ALTER TABLE "games" ADD CONSTRAINT "nintendo_catalog_only"
  CHECK ("nintendo_nsuid" IS NULL OR ("status" <> 'ACTIVE' AND "studio_id" IS NULL AND "publisher_id" IS NULL AND "steam_app_id" IS NULL));
