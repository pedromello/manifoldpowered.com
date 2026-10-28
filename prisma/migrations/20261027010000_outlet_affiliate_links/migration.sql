ALTER TABLE "stores" ADD COLUMN "affiliate_settings" JSONB NOT NULL DEFAULT '{"version":1,"links":[]}';
ALTER TABLE "store_revisions" ADD COLUMN "affiliate_links" JSONB NOT NULL DEFAULT '{"version":1,"links":[]}';

CREATE TABLE "store_game_affiliate_links" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "merchant" VARCHAR(20) NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "media_type" VARCHAR(10) NOT NULL,
  "country" VARCHAR(2) NOT NULL DEFAULT 'BR',
  "url" VARCHAR(4096) NOT NULL,
  "label" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_game_affiliate_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "store_game_affiliate_link_merchant_check" CHECK ("merchant" IN ('amazon','mercado_livre','nuuvem')),
  CONSTRAINT "store_game_affiliate_link_platform_check" CHECK ("platform" IN ('steam','nintendo','playstation','xbox')),
  CONSTRAINT "store_game_affiliate_link_media_check" CHECK ("media_type" IN ('physical','digital')),
  CONSTRAINT "store_game_affiliate_link_country_check" CHECK ("country" = 'BR')
);
CREATE UNIQUE INDEX "store_game_affiliate_link_target_key" ON "store_game_affiliate_links"("store_id","game_id","merchant","platform","media_type","country");
CREATE INDEX "store_game_affiliate_links_store_id_idx" ON "store_game_affiliate_links"("store_id");
CREATE INDEX "product_events_store_id_occurred_at_idx" ON "product_events"("store_id","occurred_at");
