CREATE TABLE "product_events" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "event_key" VARCHAR(160) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "schema_version" SMALLINT NOT NULL CHECK ("schema_version" > 0),
    "source" VARCHAR(6) NOT NULL CHECK ("source" IN ('CLIENT', 'SERVER')),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_occurred_at" TIMESTAMPTZ(3),
    "user_id" TEXT,
    "anonymous_id" UUID,
    "visit_id" UUID,
    "store_id" TEXT,
    "selection_id" TEXT,
    "game_id" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "product_events_actor_check" CHECK (
      ("source" = 'SERVER' AND "user_id" IS NOT NULL)
      OR ("source" = 'CLIENT' AND "anonymous_id" IS NOT NULL AND "visit_id" IS NOT NULL)
    ),
    CONSTRAINT "product_events_properties_check" CHECK (
      jsonb_typeof("properties") = 'object' AND octet_length("properties"::text) <= 2048
    )
);
CREATE UNIQUE INDEX "product_events_event_key_key" ON "product_events" ("event_key");
CREATE INDEX "product_events_name_occurred_at_idx" ON "product_events" ("name", "occurred_at");
CREATE INDEX "product_events_user_id_occurred_at_idx" ON "product_events" ("user_id", "occurred_at");
CREATE INDEX "product_events_visit_id_occurred_at_idx" ON "product_events" ("visit_id", "occurred_at");
CREATE INDEX "product_events_received_at_idx" ON "product_events" ("received_at");

CREATE TABLE "product_event_ingest_buckets" (
    "bucket_key" VARCHAR(100) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "event_count" INTEGER NOT NULL CHECK ("event_count" >= 0),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    PRIMARY KEY ("bucket_key", "window_start")
);
CREATE INDEX "product_event_ingest_buckets_expires_at_idx" ON "product_event_ingest_buckets" ("expires_at");
