CREATE TYPE "OutletRatingScale" AS ENUM ('STARS', 'NUMERIC_10', 'TIER');

ALTER TABLE "stores" ADD COLUMN "rating_scale" "OutletRatingScale";
ALTER TABLE "store_revisions" ADD COLUMN "rating_scale" "OutletRatingScale";
ALTER TABLE "store_game_editorials"
  ADD COLUMN "rating_scale" "OutletRatingScale",
  ADD COLUMN "rating_value" INTEGER,
  ADD CONSTRAINT "store_game_editorials_rating_check" CHECK (
    ("rating_scale" IS NULL AND "rating_value" IS NULL)
    OR ("rating_scale" IS NOT NULL AND "rating_value" IS NOT NULL AND (
      ("rating_scale" = 'STARS' AND "rating_value" BETWEEN 0 AND 10)
      OR ("rating_scale" = 'NUMERIC_10' AND "rating_value" BETWEEN 0 AND 20)
      OR ("rating_scale" = 'TIER' AND "rating_value" BETWEEN 0 AND 15)
    ))
  ),
  ADD CONSTRAINT "store_game_editorials_content_check" CHECK (
    length(btrim("body")) > 0 OR "rating_value" IS NOT NULL
  );

-- Immutable read projection. References remain logical, without foreign keys.
CREATE TABLE "store_revision_game_ratings" (
  "id" TEXT NOT NULL,
  "revision_id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "rating_scale" "OutletRatingScale" NOT NULL,
  "rating_value" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_revision_game_ratings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_revision_game_ratings_value_check" CHECK (
    ("rating_scale" = 'STARS' AND "rating_value" BETWEEN 0 AND 10)
    OR ("rating_scale" = 'NUMERIC_10' AND "rating_value" BETWEEN 0 AND 20)
    OR ("rating_scale" = 'TIER' AND "rating_value" BETWEEN 0 AND 15)
  )
);
CREATE UNIQUE INDEX "store_revision_game_ratings_revision_id_game_id_key"
  ON "store_revision_game_ratings" ("revision_id", "game_id");
CREATE INDEX "store_revision_game_ratings_filter_idx"
  ON "store_revision_game_ratings" ("revision_id", "rating_scale", "rating_value", "game_id");
