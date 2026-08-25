-- A game's presence in an Outlet and an Outlet's editorial endorsement are
-- deliberately separate decisions. store_game_overrides remains SHOW/HIDE;
-- this table stores the small, ordered recommendation set.
CREATE TABLE "store_featured_games" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_featured_games_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "store_featured_games_position_check" CHECK ("position" BETWEEN 1 AND 3)
);

CREATE INDEX "store_featured_games_store_id_idx" ON "store_featured_games"("store_id");
CREATE INDEX "store_featured_games_game_id_idx" ON "store_featured_games"("game_id");
CREATE UNIQUE INDEX "store_featured_games_store_id_game_id_key" ON "store_featured_games"("store_id", "game_id");
CREATE UNIQUE INDEX "store_featured_games_store_id_position_key" ON "store_featured_games"("store_id", "position");
