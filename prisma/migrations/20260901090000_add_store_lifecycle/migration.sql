-- Lifecycle state and immutable publication snapshots. Existing Outlets were
-- already live before this migration, so each receives a LEGACY_ALL snapshot
-- and remains PUBLISHED. New rows keep the final DRAFT default.
CREATE TYPE "StoreStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "StoreLifecycleAction" AS ENUM ('PUBLISH', 'UNPUBLISH');
CREATE TYPE "StoreCatalogMode" AS ENUM ('UNDECIDED', 'ALL', 'SELECTED');
CREATE TYPE "StoreRevisionCatalogMode" AS ENUM ('LEGACY_ALL', 'ALL', 'SELECTED');

ALTER TABLE "stores"
ADD COLUMN "status" "StoreStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "catalog_mode" "StoreCatalogMode" NOT NULL DEFAULT 'UNDECIDED',
ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "published_revision_id" TEXT,
ADD COLUMN "last_published_revision_id" TEXT,
ADD COLUMN "published_at" TIMESTAMP(3),
ADD COLUMN "last_published_at" TIMESTAMP(3);

CREATE TABLE "store_revisions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "source_draft_revision" INTEGER NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "catalog_mode" "StoreRevisionCatalogMode" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(2048),
    "tag_filters" JSONB NOT NULL,
    "game_overrides" JSONB NOT NULL,
    "featured_games" JSONB NOT NULL,
    "presentation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_revisions_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "store_revisions_source_draft_revision_positive" CHECK ("source_draft_revision" > 0)
);

CREATE UNIQUE INDEX "store_revisions_store_id_revision_key"
ON "store_revisions"("store_id", "revision");
CREATE INDEX "store_revisions_store_id_created_at_idx"
ON "store_revisions"("store_id", "created_at");

INSERT INTO "store_revisions" (
    "id", "store_id", "revision", "source_draft_revision", "actor_user_id",
    "catalog_mode", "name", "description", "logo_url", "tag_filters",
    "game_overrides", "featured_games", "presentation", "created_at"
)
SELECT
    'legacy-' || s."id",
    s."id",
    1,
    1,
    s."owner_id",
    'LEGACY_ALL'::"StoreRevisionCatalogMode",
    s."name",
    s."description",
    s."logo_url",
    COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object('tag', f."tag", 'mode', f."mode"::text)
            ORDER BY f."created_at", f."id"
        )
        FROM "store_tag_filters" f
        WHERE f."store_id" = s."id"
    ), '[]'::jsonb),
    COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'game_id', o."game_id",
                'visibility', o."visibility"::text
            )
            ORDER BY o."created_at", o."id"
        )
        FROM "store_game_overrides" o
        WHERE o."store_id" = s."id"
    ), '[]'::jsonb),
    COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'game_id', f."game_id",
                'position', f."position",
                'recommendation_reason', f."recommendation_reason"
            )
            ORDER BY f."position", f."id"
        )
        FROM "store_featured_games" f
        WHERE f."store_id" = s."id"
    ), '[]'::jsonb),
    jsonb_build_object(
        'version', 1,
        'layout_preset', 'EDITORIAL',
        'palette_id', 'MANIFOLD',
        'typography_id', 'MANIFOLD',
        'shape_id', 'MANIFOLD',
        'tagline', NULL,
        'cover_image_url', NULL,
        'social_links', '{}'::jsonb,
        'theme_key', CASE
            WHEN s."slug" IN ('neon-alley', 'strategos-void') THEN s."slug"
            ELSE NULL
        END
    ),
    s."updated_at"
FROM "stores" s;

UPDATE "stores"
SET
    "status" = 'PUBLISHED',
    -- Legacy working drafts retain an explicit compatible choice. This does
    -- not affect their live LEGACY_ALL snapshot; future publishes are v2.
    "catalog_mode" = CASE
        WHEN EXISTS (
            SELECT 1 FROM "store_tag_filters" f
            WHERE f."store_id" = "stores"."id" AND f."mode" = 'WHITELIST'
        ) OR EXISTS (
            SELECT 1 FROM "store_game_overrides" o
            WHERE o."store_id" = "stores"."id" AND o."visibility" = 'SHOW'
        ) THEN 'SELECTED'::"StoreCatalogMode"
        ELSE 'ALL'::"StoreCatalogMode"
    END,
    "published_revision_id" = 'legacy-' || "id",
    "last_published_revision_id" = 'legacy-' || "id",
    "published_at" = "updated_at",
    "last_published_at" = "updated_at";

-- Route middleware checks the coarse feature before resource ownership. New
-- activations receive publish:store from code, but existing activated owners
-- must receive it in the same atomic rollout as the lifecycle columns or they
-- cannot manage the Outlet that this migration just marked PUBLISHED.
-- `update:user` is the established marker for activated, non-disabled users;
-- disabled owners deliberately keep their revoked feature set.
UPDATE "users"
SET
    "features" = array_append("features", 'publish:store'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE
    "id" IN (SELECT "owner_id" FROM "stores")
    AND "features" @> ARRAY['update:user']::TEXT[]
    AND NOT "features" @> ARRAY['publish:store']::TEXT[];

ALTER TABLE "stores"
ADD CONSTRAINT "stores_draft_revision_positive" CHECK ("draft_revision" > 0),
ADD CONSTRAINT "stores_publication_pointer_consistent" CHECK (
    (
        "status" = 'PUBLISHED'
        AND "published_revision_id" IS NOT NULL
        AND "published_at" IS NOT NULL
    ) OR (
        "status" = 'DRAFT'
        AND "published_revision_id" IS NULL
        AND "published_at" IS NULL
    )
),
ADD CONSTRAINT "stores_last_publication_consistent" CHECK (
    ("last_published_revision_id" IS NULL AND "last_published_at" IS NULL)
    OR
    ("last_published_revision_id" IS NOT NULL AND "last_published_at" IS NOT NULL)
);

CREATE INDEX "stores_status_updated_at_idx" ON "stores"("status", "updated_at");
CREATE INDEX "stores_published_revision_id_idx" ON "stores"("published_revision_id");

-- New attributed acquisitions freeze the live revision that produced them.
-- Historical sales remain attributable to Store but have no revision pointer.
ALTER TABLE "sales" ADD COLUMN "store_revision_id" TEXT;
UPDATE "sales"
SET "store_revision_id" = 'legacy-' || "store_id"
WHERE "store_id" IS NOT NULL;
CREATE INDEX "sales_store_revision_id_idx" ON "sales"("store_revision_id");

CREATE TABLE "store_lifecycle_events" (
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

CREATE INDEX "store_lifecycle_events_store_id_created_at_idx"
ON "store_lifecycle_events"("store_id", "created_at");
CREATE INDEX "store_lifecycle_events_actor_user_id_created_at_idx"
ON "store_lifecycle_events"("actor_user_id", "created_at");
