-- Steam app 391220 (Rise of the Tomb Raider) has no `header_2x.jpg` asset.
-- The previous high-resolution-header migration changed its working
-- `header.jpg` URL to a 404. Restore the verified original header on deploy.
UPDATE "games"
SET "media" = jsonb_set(
  "media",
  '{banner}',
  to_jsonb(
    regexp_replace(
      "media" ->> 'banner',
      '/header_2x\\.jpg(\\?.*)?$',
      '/header.jpg\\1'
    )
  )
)
WHERE "steam_app_id" = '391220'
  AND "media" ? 'banner'
  AND "media" ->> 'banner' ~* '^https://([a-z0-9-]+\\.)*steamstatic\\.com/.*/header_2x\\.jpg(\\?.*)?$';
