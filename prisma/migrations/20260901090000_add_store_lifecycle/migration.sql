-- Forward-only bridge for pre-lifecycle, old Sprint 3 and canonical databases.
BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '20min';
SELECT pg_advisory_xact_lock(hashtext('manifold:store-lifecycle-bridge:v2'));

LOCK TABLE "stores", "sales", "users", "store_tag_filters",
  "store_game_overrides", "store_featured_games" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_store_lifecycle_bridge_state" (
  "state" TEXT NOT NULL CHECK ("state" IN ('fresh', 'legacy_s3', 'canonical'))
) ON COMMIT DROP;

DO $$
DECLARE
  revisions_exist BOOLEAN := to_regclass('public.store_revisions') IS NOT NULL;
  publication_status_exists BOOLEAN;
  status_exists BOOLEAN;
  revision_number_exists BOOLEAN := FALSE;
  revision_exists BOOLEAN := FALSE;
  last_pointer_exists BOOLEAN;
  bridge_state TEXT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'publication_status') INTO publication_status_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'status') INTO status_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name = 'last_published_revision_id') INTO last_pointer_exists;
  IF revisions_exist THEN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_revisions'
        AND column_name = 'revision_number') INTO revision_number_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'store_revisions'
        AND column_name = 'revision') INTO revision_exists;
  END IF;

  IF NOT revisions_exist AND NOT publication_status_exists AND NOT status_exists THEN
    bridge_state := 'fresh';
  ELSIF revisions_exist AND publication_status_exists AND NOT status_exists
    AND revision_number_exists AND NOT revision_exists THEN
    bridge_state := 'legacy_s3';
  ELSIF revisions_exist AND NOT publication_status_exists AND status_exists
    AND NOT revision_number_exists AND revision_exists AND last_pointer_exists THEN
    bridge_state := 'canonical';
  ELSE
    RAISE EXCEPTION 'Unknown Store lifecycle schema shape; refusing bridge mutation';
  END IF;
  INSERT INTO "_store_lifecycle_bridge_state" VALUES (bridge_state);
END $$;

DO $$
BEGIN
  IF to_regclass('public.store_revisions') IS NOT NULL THEN
    LOCK TABLE "store_revisions" IN SHARE ROW EXCLUSIVE MODE;
  END IF;
END $$;

-- Guard exact enum labels before reuse.
DO $$
DECLARE
  enum_name TEXT;
  expected TEXT[];
  actual TEXT[];
BEGIN
  FOR enum_name, expected IN SELECT * FROM (VALUES
    ('StoreStatus', ARRAY['DRAFT','PUBLISHED']::TEXT[]),
    ('StoreLifecycleAction', ARRAY['PUBLISH','UNPUBLISH']::TEXT[]),
    ('StoreCatalogMode', ARRAY['UNDECIDED','ALL','SELECTED']::TEXT[]),
    ('StoreRevisionCatalogMode', ARRAY['LEGACY_ALL','ALL','SELECTED']::TEXT[])
  ) AS definitions(name, labels)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = enum_name) THEN
      SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO actual
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = enum_name;
      IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Enum % has unexpected labels: %', enum_name, actual;
      END IF;
    ELSE
      EXECUTE format('CREATE TYPE %I AS ENUM (%s)', enum_name,
        (SELECT string_agg(quote_literal(label), ', ')
         FROM unnest(expected) AS label));
    END IF;
  END LOOP;
END $$;

ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "status" "StoreStatus",
  ADD COLUMN IF NOT EXISTS "catalog_mode" "StoreCatalogMode",
  ADD COLUMN IF NOT EXISTS "draft_revision" INTEGER,
  ADD COLUMN IF NOT EXISTS "published_revision_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_published_revision_id" TEXT,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_published_at" TIMESTAMP(3);

-- Reconcile old-S3 current and last publication pointers.
DO $$
BEGIN
  IF (SELECT "state" = 'legacy_s3' FROM "_store_lifecycle_bridge_state") THEN
    EXECUTE $sql$
      UPDATE "stores"
      SET
        "status" = CASE WHEN "publication_status"::TEXT = 'PUBLISHED'
          THEN 'PUBLISHED'::"StoreStatus" ELSE 'DRAFT'::"StoreStatus" END,
        "last_published_revision_id" = "published_revision_id",
        "last_published_at" = "published_at",
        "published_revision_id" = CASE WHEN "publication_status"::TEXT = 'PUBLISHED'
          THEN "published_revision_id" ELSE NULL END,
        "published_at" = CASE WHEN "publication_status"::TEXT = 'PUBLISHED'
          THEN "published_at" ELSE NULL END
    $sql$;
  END IF;
END $$;

-- Old-S3 immutable rows are mapped in place; identity and created_at remain intact.
DO $$
BEGIN
  IF (SELECT "state" = 'legacy_s3' FROM "_store_lifecycle_bridge_state") THEN
    ALTER TABLE "store_revisions"
      ADD COLUMN IF NOT EXISTS "revision" INTEGER,
      ADD COLUMN IF NOT EXISTS "actor_user_id" TEXT,
      ADD COLUMN IF NOT EXISTS "catalog_mode" "StoreRevisionCatalogMode",
      ADD COLUMN IF NOT EXISTS "presentation" JSONB;
    UPDATE "store_revisions"
    SET
      "revision" = "revision_number",
      "actor_user_id" = "created_by",
      "catalog_mode" = CASE WHEN "curation_strategy"::TEXT = 'NONE'
        THEN 'ALL'::"StoreRevisionCatalogMode"
        ELSE 'SELECTED'::"StoreRevisionCatalogMode" END,
      "presentation" = jsonb_build_object(
        'version', 1, 'layout_preset', to_jsonb("layout_preset"),
        'tagline', to_jsonb("tagline"), 'cover_image_url', to_jsonb("cover_url"),
        'social_links', COALESCE("social_links", '{}'::jsonb),
        'brand_tokens', COALESCE("brand_tokens",
          '{"palette":"manifold","typography":"modern","shape":"soft"}'::jsonb),
        'theme_key', to_jsonb("theme_key"));
    ALTER TABLE "store_revisions"
      ALTER COLUMN "revision_number" DROP NOT NULL,
      ALTER COLUMN "created_by" DROP NOT NULL,
      ALTER COLUMN "social_links" DROP NOT NULL,
      ALTER COLUMN "brand_tokens" DROP NOT NULL,
      ALTER COLUMN "curation_strategy" DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "store_revisions" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "revision" INTEGER,
  "source_draft_revision" INTEGER,
  "actor_user_id" TEXT,
  "catalog_mode" "StoreRevisionCatalogMode",
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "logo_url" VARCHAR(2048),
  "tag_filters" JSONB NOT NULL,
  "game_overrides" JSONB NOT NULL,
  "featured_games" JSONB NOT NULL,
  "presentation" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_revisions_pkey" PRIMARY KEY ("id")
);

-- Compatibility revisions are generated only for the fresh state.
INSERT INTO "store_revisions" (
  "id", "store_id", "revision", "source_draft_revision", "actor_user_id",
  "catalog_mode", "name", "description", "logo_url", "tag_filters",
  "game_overrides", "featured_games", "presentation", "created_at"
)
SELECT
  'legacy-' || store."id", store."id", 1, COALESCE(store."draft_revision", 1),
  store."owner_id", 'LEGACY_ALL'::"StoreRevisionCatalogMode",
  store."name", store."description", store."logo_url",
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'tag', f."tag", 'mode', f."mode"::TEXT) ORDER BY f."created_at", f."id")
    FROM "store_tag_filters" f WHERE f."store_id" = store."id"), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'game_id', o."game_id", 'visibility', o."visibility"::TEXT)
    ORDER BY o."created_at", o."id")
    FROM "store_game_overrides" o WHERE o."store_id" = store."id"), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'game_id', f."game_id", 'position', f."position",
    'recommendation_reason', f."recommendation_reason")
    ORDER BY f."position", f."id")
    FROM "store_featured_games" f WHERE f."store_id" = store."id"), '[]'::jsonb),
  jsonb_build_object(
    'version', 1, 'layout_preset', NULL, 'tagline', NULL,
    'cover_image_url', NULL, 'social_links', '{}'::jsonb,
    'brand_tokens', '{"palette":"manifold","typography":"modern","shape":"soft"}'::jsonb,
    'theme_key', CASE WHEN store."slug" IN ('neon-alley','strategos-void')
      THEN to_jsonb(store."slug") ELSE 'null'::jsonb END),
  store."updated_at"
FROM "stores" store
CROSS JOIN "_store_lifecycle_bridge_state" bridge_state
WHERE bridge_state."state" = 'fresh';

UPDATE "stores" store
SET
  "status" = 'PUBLISHED'::"StoreStatus",
  "catalog_mode" = CASE WHEN EXISTS (
    SELECT 1 FROM "store_tag_filters" f
    WHERE f."store_id" = store."id" AND f."mode"::TEXT = 'WHITELIST')
    OR EXISTS (SELECT 1 FROM "store_game_overrides" o
    WHERE o."store_id" = store."id" AND o."visibility"::TEXT = 'SHOW')
    THEN 'SELECTED'::"StoreCatalogMode" ELSE 'ALL'::"StoreCatalogMode" END,
  "draft_revision" = COALESCE(store."draft_revision", 1),
  "published_revision_id" = 'legacy-' || store."id",
  "last_published_revision_id" = 'legacy-' || store."id",
  "published_at" = store."updated_at",
  "last_published_at" = store."updated_at"
FROM "_store_lifecycle_bridge_state" bridge_state
WHERE bridge_state."state" = 'fresh';

UPDATE "stores"
SET
  "catalog_mode" = COALESCE("catalog_mode", CASE WHEN EXISTS (
    SELECT 1 FROM "store_tag_filters" f
    WHERE f."store_id" = "stores"."id" AND f."mode"::TEXT = 'WHITELIST')
    OR EXISTS (SELECT 1 FROM "store_game_overrides" o
    WHERE o."store_id" = "stores"."id" AND o."visibility"::TEXT = 'SHOW')
    THEN 'SELECTED'::"StoreCatalogMode" ELSE 'ALL'::"StoreCatalogMode" END),
  "draft_revision" = COALESCE("draft_revision", 1);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "stores" store
    WHERE (store."published_revision_id" IS NULL) <> (store."published_at" IS NULL)
      OR (store."last_published_revision_id" IS NULL) <> (store."last_published_at" IS NULL)
      OR (store."status"::TEXT = 'PUBLISHED' AND store."published_revision_id" IS NULL)) THEN
    RAISE EXCEPTION 'Store lifecycle pointer pairs are inconsistent';
  END IF;
  IF EXISTS (SELECT 1 FROM "stores" store JOIN "store_revisions" revision
    ON revision."id" IN (store."published_revision_id", store."last_published_revision_id")
    WHERE revision."store_id" <> store."id") THEN
    RAISE EXCEPTION 'Store lifecycle pointer is cross-Store';
  END IF;
END $$;

ALTER TABLE "stores"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "catalog_mode" SET DEFAULT 'UNDECIDED',
  ALTER COLUMN "catalog_mode" SET NOT NULL,
  ALTER COLUMN "draft_revision" SET DEFAULT 1,
  ALTER COLUMN "draft_revision" SET NOT NULL;
ALTER TABLE "store_revisions"
  ALTER COLUMN "revision" SET NOT NULL,
  ALTER COLUMN "source_draft_revision" SET NOT NULL,
  ALTER COLUMN "actor_user_id" SET NOT NULL,
  ALTER COLUMN "catalog_mode" SET NOT NULL,
  ALTER COLUMN "presentation" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname =
    'store_revisions_revision_positive' AND conrelid = to_regclass('public.store_revisions')) THEN
    ALTER TABLE "store_revisions"
      ADD CONSTRAINT "store_revisions_revision_positive" CHECK ("revision" > 0),
      ADD CONSTRAINT "store_revisions_source_draft_revision_positive"
        CHECK ("source_draft_revision" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname =
    'stores_draft_revision_positive' AND conrelid = to_regclass('public.stores')) THEN
    ALTER TABLE "stores"
      ADD CONSTRAINT "stores_draft_revision_positive" CHECK ("draft_revision" > 0),
      ADD CONSTRAINT "stores_publication_pointer_consistent" CHECK (
        ("status" = 'PUBLISHED' AND "published_revision_id" IS NOT NULL AND "published_at" IS NOT NULL)
        OR ("status" = 'DRAFT' AND "published_revision_id" IS NULL AND "published_at" IS NULL)),
      ADD CONSTRAINT "stores_last_publication_consistent" CHECK (
        ("last_published_revision_id" IS NULL AND "last_published_at" IS NULL)
        OR ("last_published_revision_id" IS NOT NULL AND "last_published_at" IS NOT NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "store_revisions_store_id_revision_key"
  ON "store_revisions"("store_id", "revision");
CREATE INDEX IF NOT EXISTS "store_revisions_store_id_created_at_idx"
  ON "store_revisions"("store_id", "created_at");
CREATE INDEX IF NOT EXISTS "stores_status_updated_at_idx"
  ON "stores"("status", "updated_at");
CREATE INDEX IF NOT EXISTS "stores_published_revision_id_idx"
  ON "stores"("published_revision_id");

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "store_revision_id" TEXT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sales" sale LEFT JOIN "store_revisions" revision
    ON revision."id" = sale."store_revision_id"
    WHERE sale."store_revision_id" IS NOT NULL
      AND (revision."id" IS NULL OR revision."store_id" IS DISTINCT FROM sale."store_id")) THEN
    RAISE EXCEPTION 'Existing Sale pointer is orphaned or cross-Store';
  END IF;
END $$;

-- Null-only temporal attribution: latest at/before the sale, else earliest.
UPDATE "sales" AS sale
SET "store_revision_id" = COALESCE(
  (SELECT revision."id" FROM "store_revisions" revision
   WHERE revision."store_id" = sale."store_id"
     AND revision."created_at" <= sale."created_at"
   ORDER BY revision."created_at" DESC, revision."revision" DESC, revision."id" DESC
   LIMIT 1),
  (SELECT revision."id" FROM "store_revisions" revision
   WHERE revision."store_id" = sale."store_id"
   ORDER BY revision."created_at" ASC, revision."revision" ASC, revision."id" ASC
   LIMIT 1))
WHERE sale."store_id" IS NOT NULL
  AND sale."store_revision_id" IS NULL;
CREATE INDEX IF NOT EXISTS "sales_store_revision_id_idx"
  ON "sales"("store_revision_id");

UPDATE "users"
SET "features" = array_append("features", 'publish:store')
WHERE "id" IN (SELECT "owner_id" FROM "stores")
  AND "features" @> ARRAY['update:user']::TEXT[]
  AND NOT "features" @> ARRAY['publish:store']::TEXT[];

CREATE TABLE IF NOT EXISTS "store_lifecycle_events" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "store_revision_id" TEXT,
  "draft_revision" INTEGER NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "action" "StoreLifecycleAction" NOT NULL,
  "from_status" "StoreStatus" NOT NULL,
  "to_status" "StoreStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_lifecycle_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "store_lifecycle_events_store_id_created_at_idx"
  ON "store_lifecycle_events"("store_id", "created_at");
CREATE INDEX IF NOT EXISTS "store_lifecycle_events_actor_user_id_created_at_idx"
  ON "store_lifecycle_events"("actor_user_id", "created_at");

-- Guard object definitions before accepting an existing canonical object.
DO $$
DECLARE
  index_definition TEXT;
  constraint_definition TEXT;
BEGIN
  SELECT pg_get_indexdef(indexrelid) INTO index_definition FROM pg_index
    WHERE indexrelid = to_regclass('public.store_revisions_store_id_revision_key');
  IF index_definition IS NULL OR index_definition NOT ILIKE '%UNIQUE INDEX%'
    OR index_definition NOT ILIKE '%store_id%'
    OR index_definition NOT ILIKE '%revision%' THEN
    RAISE EXCEPTION 'Unexpected canonical revision index definition';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO constraint_definition FROM pg_constraint
    WHERE conname = 'stores_publication_pointer_consistent'
      AND conrelid = to_regclass('public.stores');
  IF constraint_definition IS NULL
    OR constraint_definition NOT ILIKE '%published_revision_id%'
    OR constraint_definition NOT ILIKE '%published_at%' THEN
    RAISE EXCEPTION 'Unexpected publication pointer constraint definition';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sales" sale JOIN "store_revisions" revision
    ON revision."id" = sale."store_revision_id"
    WHERE revision."store_id" IS DISTINCT FROM sale."store_id") THEN
    RAISE EXCEPTION 'Sale attribution postcondition failed';
  END IF;
  IF EXISTS (SELECT 1 FROM "stores" store LEFT JOIN "store_revisions" revision
    ON revision."id" = store."last_published_revision_id"
    WHERE store."last_published_revision_id" IS NOT NULL
      AND (revision."id" IS NULL OR revision."store_id" <> store."id")) THEN
    RAISE EXCEPTION 'Last published revision ownership postcondition failed';
  END IF;
END $$;

COMMIT;
