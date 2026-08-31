-- Steam's appdetails endpoint stores `header.jpg` (460x215), even though the
-- matching `header_2x.jpg` (920x430) asset is available on its CDN. Update
-- only Steam-imported games with a recognised Steam CDN banner.
UPDATE "games"
SET "media" = jsonb_set(
  "media",
  '{banner}',
  to_jsonb(
    regexp_replace(
      "media" ->> 'banner',
      '/header\\.jpg(\\?.*)?$',
      '/header_2x.jpg\\1'
    )
  )
)
WHERE "steam_app_id" IS NOT NULL
  AND "media" ? 'banner'
  AND "media" ->> 'banner' ~* '^https://([a-z0-9-]+\\.)*steamstatic\\.com/.*/header\\.jpg(\\?.*)?$';
