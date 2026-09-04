-- Reviews are owned by the Outlet × game relationship, independently from
-- the three Featured slots.
CREATE TABLE "store_game_editorials" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "headline" VARCHAR(120),
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_game_editorials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_game_editorials_store_id_game_id_key"
  ON "store_game_editorials"("store_id", "game_id");
CREATE INDEX "store_game_editorials_store_id_idx"
  ON "store_game_editorials"("store_id");
CREATE INDEX "store_game_editorials_game_id_idx"
  ON "store_game_editorials"("game_id");

ALTER TABLE "store_revisions"
  ADD COLUMN "game_editorials" JSONB NOT NULL DEFAULT '[]';

-- Preserve existing creator copy as an independent draft review.
INSERT INTO "store_game_editorials"
  ("id", "store_id", "game_id", "headline", "body", "created_at", "updated_at")
SELECT
  md5("store_id" || ':' || "game_id"),
  "store_id",
  "game_id",
  NULL,
  trim("recommendation_reason"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "store_featured_games"
WHERE trim(coalesce("recommendation_reason", '')) <> ''
ON CONFLICT ("store_id", "game_id") DO NOTHING;

-- Published revisions stay immutable in meaning while gaining the new field.
UPDATE "store_revisions" AS revision
SET "game_editorials" = coalesce(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'game_id', featured->>'game_id',
        'headline', NULL,
        'body', featured->>'recommendation_reason'
      )
      ORDER BY (featured->>'position')::integer
    )
    FROM jsonb_array_elements(revision."featured_games") AS featured
    WHERE trim(coalesce(featured->>'recommendation_reason', '')) <> ''
  ),
  '[]'::jsonb
);
