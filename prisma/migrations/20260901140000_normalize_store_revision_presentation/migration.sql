-- Forward-only compatibility normalization for immutable public presentation
-- payloads. The lifecycle bridge owns structural reconciliation; this migration
-- deliberately updates no identity, lifecycle, catalog, attribution, grant, or
-- pointer field.
WITH "normalized_presentations" AS (
  SELECT
    revision."id",
    jsonb_build_object(
      'version', 1,
      'layout_preset',
        CASE
          WHEN jsonb_typeof(revision."presentation" -> 'layout_preset') = 'string'
            AND revision."presentation" ->> 'layout_preset'
              IN ('channel', 'editorial', 'community')
          THEN revision."presentation" -> 'layout_preset'
          ELSE 'null'::jsonb
        END,
      'tagline',
        CASE
          WHEN jsonb_typeof(revision."presentation" -> 'tagline') = 'string'
            AND char_length(btrim(revision."presentation" ->> 'tagline')) <= 160
          THEN to_jsonb(btrim(revision."presentation" ->> 'tagline'))
          ELSE 'null'::jsonb
        END,
      'cover_image_url',
        CASE
          WHEN jsonb_typeof(revision."presentation" -> 'cover_image_url') = 'string'
            AND char_length(btrim(revision."presentation" ->> 'cover_image_url')) <= 2048
            AND btrim(revision."presentation" ->> 'cover_image_url')
              ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
          THEN to_jsonb(btrim(revision."presentation" ->> 'cover_image_url'))
          ELSE 'null'::jsonb
        END,
      'social_links',
        COALESCE(
          (
            SELECT jsonb_object_agg(
              social.platform,
              to_jsonb(btrim(social.value #>> '{}'))
              ORDER BY social.platform
            )
            FROM jsonb_each(
              CASE
                WHEN jsonb_typeof(revision."presentation" -> 'social_links') = 'object'
                THEN revision."presentation" -> 'social_links'
                ELSE '{}'::jsonb
              END
            ) AS social(platform, value)
            WHERE social.platform IN (
              'website',
              'youtube',
              'twitch',
              'instagram',
              'tiktok',
              'x',
              'discord',
              'bluesky'
            )
              AND jsonb_typeof(social.value) = 'string'
              AND char_length(btrim(social.value #>> '{}')) <= 2048
              AND btrim(social.value #>> '{}')
                ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
          ),
          '{}'::jsonb
        ),
      'brand_tokens',
        jsonb_build_object(
          'palette',
            CASE
              WHEN revision."presentation" #>> '{brand_tokens,palette}'
                IN ('manifold', 'ember', 'ocean')
              THEN revision."presentation" #>> '{brand_tokens,palette}'
              WHEN upper(COALESCE(revision."presentation" ->> 'palette_id', ''))
                IN ('MANIFOLD', 'EMBER', 'OCEAN')
              THEN lower(revision."presentation" ->> 'palette_id')
              ELSE 'manifold'
            END,
          'typography',
            CASE
              WHEN revision."presentation" #>> '{brand_tokens,typography}'
                IN ('modern', 'editorial', 'rounded')
              THEN revision."presentation" #>> '{brand_tokens,typography}'
              WHEN upper(COALESCE(revision."presentation" ->> 'typography_id', ''))
                IN ('MODERN', 'EDITORIAL', 'ROUNDED')
              THEN lower(revision."presentation" ->> 'typography_id')
              ELSE 'modern'
            END,
          'shape',
            CASE
              WHEN revision."presentation" #>> '{brand_tokens,shape}'
                IN ('soft', 'crisp', 'pill')
              THEN revision."presentation" #>> '{brand_tokens,shape}'
              WHEN upper(COALESCE(revision."presentation" ->> 'shape_id', ''))
                IN ('SOFT', 'CRISP', 'PILL')
              THEN lower(revision."presentation" ->> 'shape_id')
              ELSE 'soft'
            END
        ),
      'theme_key',
        CASE
          WHEN jsonb_typeof(revision."presentation" -> 'theme_key') = 'string'
            AND revision."presentation" ->> 'theme_key'
              IN ('neon-alley', 'strategos-void')
          THEN revision."presentation" -> 'theme_key'
          ELSE 'null'::jsonb
        END
    ) AS "normalized_presentation"
  FROM "store_revisions" AS revision
)
UPDATE "store_revisions" AS revision
SET "presentation" = normalized."normalized_presentation"
FROM "normalized_presentations" AS normalized
WHERE revision."id" = normalized."id"
  AND revision."presentation" IS DISTINCT FROM normalized."normalized_presentation";
