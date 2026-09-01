-- Existing Outlets predate lifecycle and are intentionally rolled out as
-- published. New Outlets use the schema default and start as drafts.
CREATE TYPE "StorePublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "StoreCurationStrategy" AS ENUM ('NONE', 'RULES', 'MANUAL', 'MIXED');

-- A bespoke storefront is a platform assignment. It is deliberately distinct
-- from the owner-writable layout preset and from the public slug. Store is the
-- editable draft; StoreRevision holds each immutable published snapshot.
ALTER TABLE "stores"
ADD COLUMN "theme_key" VARCHAR(64),
ADD COLUMN "layout_preset" VARCHAR(32),
ADD COLUMN "tagline" VARCHAR(160),
ADD COLUMN "cover_url" VARCHAR(2048),
ADD COLUMN "social_links" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "brand_tokens" JSONB NOT NULL DEFAULT '{"palette":"manifold","typography":"modern","shape":"soft"}',
ADD COLUMN "publication_status" "StorePublicationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "published_revision_id" TEXT,
ADD COLUMN "published_at" TIMESTAMP(3),
ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 1;

-- Preserve the two hand-built storefronts while removing slug as the runtime
-- authority for choosing a bespoke theme.
UPDATE "stores"
SET "theme_key" = "slug"
WHERE "slug" IN ('neon-alley', 'strategos-void');

CREATE TABLE "store_revisions" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "source_draft_revision" INTEGER NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "logo_url" VARCHAR(2048),
  "theme_key" VARCHAR(64),
  "layout_preset" VARCHAR(32),
  "tagline" VARCHAR(160),
  "cover_url" VARCHAR(2048),
  "social_links" JSONB NOT NULL,
  "brand_tokens" JSONB NOT NULL,
  "curation_strategy" "StoreCurationStrategy" NOT NULL,
  "featured_games" JSONB NOT NULL,
  "tag_filters" JSONB NOT NULL,
  "game_overrides" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_revisions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "store_revisions" (
  "id",
  "store_id",
  "revision_number",
  "source_draft_revision",
  "created_by",
  "name",
  "description",
  "logo_url",
  "theme_key",
  "layout_preset",
  "tagline",
  "cover_url",
  "social_links",
  "brand_tokens",
  "curation_strategy",
  "featured_games",
  "tag_filters",
  "game_overrides"
)
SELECT
  gen_random_uuid()::text,
  "id",
  1,
  "draft_revision",
  "owner_id",
  "name",
  "description",
  "logo_url",
  "theme_key",
  "layout_preset",
  "tagline",
  "cover_url",
  "social_links",
  "brand_tokens",
  CASE
    WHEN EXISTS (SELECT 1 FROM "store_tag_filters" AS tf WHERE tf."store_id" = "stores"."id")
      AND EXISTS (SELECT 1 FROM "store_game_overrides" AS go_row WHERE go_row."store_id" = "stores"."id") THEN 'MIXED'::"StoreCurationStrategy"
    WHEN EXISTS (SELECT 1 FROM "store_tag_filters" AS tf WHERE tf."store_id" = "stores"."id") THEN 'RULES'::"StoreCurationStrategy"
    WHEN EXISTS (SELECT 1 FROM "store_game_overrides" AS go_row WHERE go_row."store_id" = "stores"."id") THEN 'MANUAL'::"StoreCurationStrategy"
    ELSE 'NONE'::"StoreCurationStrategy"
  END,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'game_id', featured."game_id",
      'position', featured."position",
      'recommendation_reason', featured."recommendation_reason"
    ) ORDER BY featured."position")
    FROM "store_featured_games" AS featured
    WHERE featured."store_id" = "stores"."id"
  ), '[]'::jsonb),
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'tag', tf."tag",
      'mode', tf."mode"
    ) ORDER BY tf."created_at")
    FROM "store_tag_filters" AS tf
    WHERE tf."store_id" = "stores"."id"
  ), '[]'::jsonb),
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'game_id', go_row."game_id",
      'visibility', go_row."visibility"
    ) ORDER BY go_row."created_at")
    FROM "store_game_overrides" AS go_row
    WHERE go_row."store_id" = "stores"."id"
  ), '[]'::jsonb)
FROM "stores";

UPDATE "stores" AS store
SET
  "publication_status" = 'PUBLISHED',
  "published_revision_id" = revision."id",
  "published_at" = revision."created_at"
FROM "store_revisions" AS revision
WHERE revision."store_id" = store."id";

CREATE UNIQUE INDEX "stores_theme_key_key" ON "stores"("theme_key");
CREATE UNIQUE INDEX "stores_published_revision_id_key" ON "stores"("published_revision_id");
CREATE UNIQUE INDEX "store_revisions_store_id_revision_number_key" ON "store_revisions"("store_id", "revision_number");
CREATE INDEX "store_revisions_store_id_created_at_idx" ON "store_revisions"("store_id", "created_at");

-- Application validation provides the user-facing error. This constraint is
-- defence in depth for scripts and future internal writers.
ALTER TABLE "stores"
ADD CONSTRAINT "stores_layout_preset_check"
CHECK ("layout_preset" IN ('channel', 'editorial', 'community'));

ALTER TABLE "store_revisions"
ADD CONSTRAINT "store_revisions_layout_preset_check"
CHECK ("layout_preset" IN ('channel', 'editorial', 'community'));
