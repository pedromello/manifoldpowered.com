-- CreateEnum
CREATE TYPE "TagFilterMode" AS ENUM ('WHITELIST', 'BLACKLIST');

-- CreateEnum
CREATE TYPE "GameOverrideVisibility" AS ENUM ('SHOW', 'HIDE');

-- CreateTable
CREATE TABLE "store_tag_filters" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "tag" VARCHAR(100) NOT NULL,
    "mode" "TagFilterMode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_tag_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_game_overrides" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "visibility" "GameOverrideVisibility" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_game_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_tag_filters_store_id_idx" ON "store_tag_filters"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_tag_filters_store_id_tag_key" ON "store_tag_filters"("store_id", "tag");

-- CreateIndex
CREATE INDEX "store_game_overrides_store_id_idx" ON "store_game_overrides"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_game_overrides_store_id_game_id_key" ON "store_game_overrides"("store_id", "game_id");
