-- AlterTable
ALTER TABLE "games" ADD COLUMN "steam_app_id" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "games_steam_app_id_key" ON "games"("steam_app_id");
