-- Presentation is mutable draft state. Immutable public presentation remains
-- in store_revisions.presentation, owned by the lifecycle migration.
ALTER TABLE "stores"
ADD COLUMN IF NOT EXISTS "theme_key" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "layout_preset" VARCHAR(32),
ADD COLUMN IF NOT EXISTS "tagline" VARCHAR(160),
ADD COLUMN IF NOT EXISTS "cover_url" VARCHAR(2048),
ADD COLUMN IF NOT EXISTS "social_links" JSONB,
ADD COLUMN IF NOT EXISTS "brand_tokens" JSONB;

UPDATE "stores"
SET
  "social_links" = COALESCE("social_links", '{}'::jsonb),
  "brand_tokens" = COALESCE(
    "brand_tokens",
    '{"palette":"manifold","typography":"modern","shape":"soft"}'::jsonb
  );

ALTER TABLE "stores"
ALTER COLUMN "social_links" SET DEFAULT '{}',
ALTER COLUMN "social_links" SET NOT NULL,
ALTER COLUMN "brand_tokens" SET DEFAULT '{"palette":"manifold","typography":"modern","shape":"soft"}',
ALTER COLUMN "brand_tokens" SET NOT NULL;

-- Bespoke themes are platform assignments. This one-time compatibility
-- mapping preserves the two hand-built storefronts without making slug the
-- runtime authority or exposing theme_key to owner PATCH requests.
UPDATE "stores"
SET "theme_key" = "slug"
WHERE
  "theme_key" IS NULL
  AND "slug" IN ('neon-alley', 'strategos-void');

CREATE UNIQUE INDEX IF NOT EXISTS "stores_theme_key_key"
ON "stores"("theme_key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE
      conname = 'stores_layout_preset_check'
      AND conrelid = to_regclass('public.stores')
  ) THEN
    ALTER TABLE "stores"
    ADD CONSTRAINT "stores_layout_preset_check"
    CHECK (
      "layout_preset" IS NULL
      OR "layout_preset" IN ('channel', 'editorial', 'community')
    );
  END IF;
END $$;
