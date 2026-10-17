CREATE TABLE "store_selections" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cover_url" VARCHAR(2048),
    "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "game_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "status" "StoreStatus" NOT NULL DEFAULT 'DRAFT',
    "published_revision" INTEGER NOT NULL DEFAULT 0,
    "published_revision_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_selections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_selections_revision_positive" CHECK ("draft_revision" > 0),
    CONSTRAINT "store_selections_game_limit" CHECK (cardinality("game_ids") <= 100),
    CONSTRAINT "store_selections_image_limit" CHECK (cardinality("image_urls") <= 6)
);

CREATE TABLE "store_selection_revisions" (
    "id" TEXT NOT NULL,
    "selection_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "source_draft_revision" INTEGER NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_selection_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_selections_store_id_slug_key" ON "store_selections"("store_id", "slug");
CREATE INDEX "store_selections_store_id_status_created_at_idx" ON "store_selections"("store_id", "status", "created_at");
CREATE INDEX "store_selections_status_published_at_idx" ON "store_selections"("status", "published_at");
CREATE INDEX "store_selections_published_revision_id_idx" ON "store_selections"("published_revision_id");
CREATE UNIQUE INDEX "store_selection_revisions_selection_id_revision_key" ON "store_selection_revisions"("selection_id", "revision");
CREATE INDEX "store_selection_revisions_selection_id_created_at_idx" ON "store_selection_revisions"("selection_id", "created_at");
