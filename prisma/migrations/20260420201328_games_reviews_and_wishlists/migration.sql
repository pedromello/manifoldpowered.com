-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ReviewScore" AS ENUM ('OVERWHELMINGLY_POSITIVE', 'VERY_POSITIVE', 'POSITIVE', 'MOSTLY_POSITIVE', 'MIXED', 'MOSTLY_NEGATIVE', 'NEGATIVE', 'VERY_NEGATIVE', 'OVERWHELMINGLY_NEGATIVE');

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "detailed_description" TEXT NOT NULL,
    "launch_date" TIMESTAMP(3) NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PRIVATE',
    "price" VARCHAR(20) NOT NULL,
    "base_price" VARCHAR(20),
    "discount_label" VARCHAR(10),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "developer_name" VARCHAR(255) NOT NULL,
    "publisher_name" VARCHAR(255),
    "meta_tags" JSONB NOT NULL DEFAULT '{}',
    "media" JSONB NOT NULL DEFAULT '{}',
    "social_links" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '{}',
    "positive_reviews" INTEGER NOT NULL DEFAULT 0,
    "negative_reviews" INTEGER NOT NULL DEFAULT 0,
    "review_score" "ReviewScore" NOT NULL DEFAULT 'MIXED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_slug_key" ON "games"("slug");

-- CreateIndex
CREATE INDEX "games_user_id_idx" ON "games"("user_id");

-- CreateIndex
CREATE INDEX "games_slug_idx" ON "games"("slug");

-- CreateIndex
CREATE INDEX "games_title_idx" ON "games"("title");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_game_id_idx" ON "reviews"("game_id");

-- CreateIndex
CREATE INDEX "wishlist_items_user_id_idx" ON "wishlist_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_user_id_game_id_key" ON "wishlist_items"("user_id", "game_id");
