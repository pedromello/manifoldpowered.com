-- CreateEnum
CREATE TYPE "GamePlatform" AS ENUM ('WINDOWS', 'MAC', 'LINUX');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('GAME');

-- CreateTable
CREATE TABLE "game_files" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "platform" "GamePlatform" NOT NULL,
    "file_url" VARCHAR(1024) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_files_game_id_idx" ON "game_files"("game_id");

-- CreateIndex
CREATE INDEX "library_items_user_id_idx" ON "library_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_items_user_id_item_id_item_type_key" ON "library_items"("user_id", "item_id", "item_type");
