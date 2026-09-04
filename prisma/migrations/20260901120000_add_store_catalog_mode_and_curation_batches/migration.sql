-- Depends on Sprint 0 migration 20260901090000_add_store_lifecycle, which
-- owns StoreCatalogMode, stores.catalog_mode and stores.draft_revision.

CREATE TYPE "GameOverrideBulkAction" AS ENUM ('SHOW', 'HIDE', 'PIN_SHOW');

CREATE TABLE "store_curation_batches" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "operation_id" VARCHAR(64) NOT NULL,
  "request_fingerprint" VARCHAR(64) NOT NULL,
  "base_draft_revision" INTEGER NOT NULL,
  "result_draft_revision" INTEGER NOT NULL,
  "action" "GameOverrideBulkAction" NOT NULL,
  "changes" JSONB NOT NULL,
  "undone_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_curation_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_curation_batches_store_id_operation_id_key"
ON "store_curation_batches"("store_id", "operation_id");

CREATE INDEX "store_curation_batches_store_id_created_at_idx"
ON "store_curation_batches"("store_id", "created_at");

CREATE TABLE "store_tag_rule_changes" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "tag" VARCHAR(100) NOT NULL,
  "previous_mode" "TagFilterMode",
  "applied_mode" "TagFilterMode",
  "base_draft_revision" INTEGER NOT NULL,
  "result_draft_revision" INTEGER NOT NULL,
  "undone_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_tag_rule_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "store_tag_rule_changes_store_id_created_at_idx"
ON "store_tag_rule_changes"("store_id", "created_at");
