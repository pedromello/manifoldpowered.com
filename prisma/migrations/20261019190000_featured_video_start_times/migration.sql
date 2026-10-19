ALTER TABLE "stores" ADD COLUMN "featured_video_start_seconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "store_selections" ADD COLUMN "featured_video_start_seconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stores" ADD CONSTRAINT "stores_featured_video_start_check"
  CHECK ("featured_video_start_seconds" BETWEEN 0 AND 604800
    AND ("featured_video_id" IS NOT NULL OR "featured_video_start_seconds" = 0));
ALTER TABLE "store_selections" ADD CONSTRAINT "store_selections_featured_video_start_check"
  CHECK ("featured_video_start_seconds" BETWEEN 0 AND 604800
    AND ("featured_video_id" IS NOT NULL OR "featured_video_start_seconds" = 0));
