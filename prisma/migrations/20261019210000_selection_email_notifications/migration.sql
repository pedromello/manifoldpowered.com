CREATE TABLE "user_notification_preferences" (
  "user_id" TEXT PRIMARY KEY,
  "email_locale" VARCHAR(5) NOT NULL CHECK ("email_locale" IN ('en','pt-BR')),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "outlet_notification_subscriptions" (
  "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "store_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "consent_email" VARCHAR(234) NOT NULL,
  "email_version" INTEGER NOT NULL CHECK ("email_version" >= 0),
  "generation" INTEGER NOT NULL DEFAULT 1 CHECK ("generation" > 0),
  "enabled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "outlet_notification_subscriptions_user_id_store_id_key" ON "outlet_notification_subscriptions"("user_id","store_id");
CREATE INDEX "outlet_notification_subscriptions_store_id_enabled_id_idx" ON "outlet_notification_subscriptions"("store_id","enabled","id");
CREATE INDEX "outlet_notification_subscriptions_user_id_enabled_idx" ON "outlet_notification_subscriptions"("user_id","enabled");
CREATE TABLE "selection_email_events" (
  "id" TEXT PRIMARY KEY, "selection_id" TEXT NOT NULL, "store_id" TEXT NOT NULL, "revision_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','FANOUT','COMPLETE','CANCELLED')),
  "fanout_cursor" TEXT, "lease_token" TEXT, "lease_until" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "selection_email_events_selection_id_key" ON "selection_email_events"("selection_id");
CREATE INDEX "selection_email_events_status_lease_until_created_at_idx" ON "selection_email_events"("status","lease_until","created_at");
CREATE TABLE "selection_email_batches" (
  "id" TEXT PRIMARY KEY, "event_id" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PREPARED' CHECK ("status" IN ('PREPARED','IN_FLIGHT','ACCEPTED','RETRY','QUARANTINED','FAILED','CANCELLED')),
  "payload" JSONB, "payload_hash" VARCHAR(64), "idempotency_key" VARCHAR(256) NOT NULL,
  "first_attempt_at" TIMESTAMPTZ(3), "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0), "lease_token" TEXT, "lease_until" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(80), "last_error_kind" VARCHAR(16) CHECK ("last_error_kind" IN ('permanent','retryable','uncertain')),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "selection_email_batches_idempotency_key_key" ON "selection_email_batches"("idempotency_key");
CREATE INDEX "selection_email_batches_status_next_attempt_at_lease_until_idx" ON "selection_email_batches"("status","next_attempt_at","lease_until");
CREATE INDEX "selection_email_batches_event_id_idx" ON "selection_email_batches"("event_id");
CREATE TABLE "selection_email_deliveries" (
  "id" TEXT PRIMARY KEY, "event_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "subscription_id" TEXT NOT NULL,
  "subscription_generation" INTEGER NOT NULL CHECK ("subscription_generation" > 0), "email_version" INTEGER NOT NULL CHECK ("email_version" >= 0),
  "recipient_email" VARCHAR(234) NOT NULL, "batch_id" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','ACCEPTED','DELIVERED','FAILED','CANCELLED','BOUNCED','COMPLAINED')),
  "provider_id" VARCHAR(128), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "selection_email_deliveries_event_id_user_id_key" ON "selection_email_deliveries"("event_id","user_id");
CREATE UNIQUE INDEX "selection_email_deliveries_provider_id_key" ON "selection_email_deliveries"("provider_id");
CREATE INDEX "selection_email_deliveries_batch_id_status_idx" ON "selection_email_deliveries"("batch_id","status");
CREATE INDEX "selection_email_deliveries_subscription_id_status_idx" ON "selection_email_deliveries"("subscription_id","status");
CREATE TABLE "selection_email_suppressions" (
  "email_hash" VARCHAR(64) PRIMARY KEY, "reason" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "selection_email_webhooks" (
  "id" VARCHAR(200) PRIMARY KEY, "provider_id" VARCHAR(128) NOT NULL, "kind" VARCHAR(32) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL, "processed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "selection_email_webhooks_processed_created_at_idx" ON "selection_email_webhooks"("processed","created_at");
CREATE INDEX "selection_email_webhooks_provider_id_idx" ON "selection_email_webhooks"("provider_id");
CREATE TABLE "selection_email_rate_limits" (
  "key" VARCHAR(32) PRIMARY KEY, "next_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "selection_email_daily_budgets" (
  "key" VARCHAR(10) PRIMARY KEY, "reserved" INTEGER NOT NULL DEFAULT 0 CHECK ("reserved" >= 0)
);
