CREATE TABLE "price_refresh_runs" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'ALL',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "requested_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "heartbeat_at" TIMESTAMP(3),
  "lease_token" TEXT,
  "lease_until" TIMESTAMP(3),
  "error_code" TEXT
);
CREATE INDEX "price_refresh_runs_status_created_at_idx" ON "price_refresh_runs"("status", "created_at");
-- One unfinished catalog run, also across API/script processes.
CREATE UNIQUE INDEX "price_refresh_one_active" ON "price_refresh_runs" ((true)) WHERE "status" IN ('QUEUED', 'RUNNING', 'DISPATCH_FAILED', 'INTERRUPTED');
CREATE TABLE "price_refresh_items" (
  "id" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL REFERENCES "price_refresh_runs"("id") ON DELETE CASCADE,
  "game_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "before" JSONB,
  "after" JSONB,
  "error_code" TEXT,
  "checked_at" TIMESTAMP(3),
  "retry_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "price_refresh_items_run_id_game_id_provider_country_key" ON "price_refresh_items"("run_id", "game_id", "provider", "country");
CREATE INDEX "price_refresh_items_run_id_status_provider_idx" ON "price_refresh_items"("run_id", "status", "provider");
