-- Following an Outlet is a player-to-curator relationship, not a game
-- wishlist. Logical references intentionally have no foreign keys, matching
-- the rest of the schema; the model layer validates the Outlet before writes.
CREATE TABLE "store_follows" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_follows_user_id_store_id_key" ON "store_follows"("user_id", "store_id");
CREATE INDEX "store_follows_user_id_created_at_idx" ON "store_follows"("user_id", "created_at");
CREATE INDEX "store_follows_store_id_created_at_idx" ON "store_follows"("store_id", "created_at");
