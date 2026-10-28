-- Optional draft video configuration; immutable publication JSON is unchanged.
ALTER TABLE "stores" ADD COLUMN "featured_video_id" VARCHAR(11);
ALTER TABLE "store_selections" ADD COLUMN "featured_video_id" VARCHAR(11);
ALTER TABLE "stores" ADD CONSTRAINT "stores_featured_video_id_check"
  CHECK ("featured_video_id" IS NULL OR "featured_video_id" ~ '^[A-Za-z0-9_-]{11}$');
ALTER TABLE "store_selections" ADD CONSTRAINT "store_selections_featured_video_id_check"
  CHECK ("featured_video_id" IS NULL OR "featured_video_id" ~ '^[A-Za-z0-9_-]{11}$');
