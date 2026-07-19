-- CreateTable
CREATE TABLE "studios" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_publisher" BOOLEAN NOT NULL DEFAULT false,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_members" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studios_slug_key" ON "studios"("slug");

-- CreateIndex
CREATE INDEX "studios_owner_id_idx" ON "studios"("owner_id");

-- CreateIndex
CREATE INDEX "studios_slug_idx" ON "studios"("slug");

-- CreateIndex
CREATE INDEX "studio_members_studio_id_idx" ON "studio_members"("studio_id");

-- CreateIndex
CREATE INDEX "studio_members_user_id_idx" ON "studio_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_members_studio_id_user_id_key" ON "studio_members"("studio_id", "user_id");

-- AlterTable: add nullable ownership columns to games ahead of backfill
ALTER TABLE "games" ADD COLUMN     "studio_id" TEXT,
ADD COLUMN     "publisher_id" TEXT;

-- Data migration: create a one-person, self-publishing studio for every distinct
-- existing game owner (games.user_id), then point their games at it.
-- Studio.slug is derived from the owner's username plus a short suffix of their
-- (unique) user id, so it can never collide even if two usernames normalize to
-- the same slug.
INSERT INTO "studios" ("id", "name", "slug", "is_publisher", "owner_id", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    u."username",
    lower(regexp_replace(u."username", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(u."id", 1, 8),
    true,
    u."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "user_id" FROM "games") AS g
JOIN "users" u ON u."id" = g."user_id";

UPDATE "games" AS gm
SET "studio_id" = s."id"
FROM "studios" AS s
WHERE s."owner_id" = gm."user_id";

-- AlterTable: ownership backfilled, studio_id is now safe to require; user_id is retired
ALTER TABLE "games" ALTER COLUMN "studio_id" SET NOT NULL;
ALTER TABLE "games" DROP COLUMN "user_id";

-- DropIndex
DROP INDEX "games_user_id_idx";

-- CreateIndex
CREATE INDEX "games_studio_id_idx" ON "games"("studio_id");

-- CreateIndex
CREATE INDEX "games_publisher_id_idx" ON "games"("publisher_id");
