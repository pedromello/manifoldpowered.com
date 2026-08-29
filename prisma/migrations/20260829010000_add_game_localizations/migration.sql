CREATE TYPE "GameLocalizationSource" AS ENUM ('STEAM', 'FALLBACK');

CREATE TABLE "game_localizations" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "detailed_description" TEXT NOT NULL,
    "source" "GameLocalizationSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_localizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "game_localizations_game_id_locale_key"
ON "game_localizations"("game_id", "locale");

CREATE INDEX "game_localizations_locale_title_idx"
ON "game_localizations"("locale", "title");

ALTER TABLE "game_localizations"
ADD CONSTRAINT "game_localizations_game_id_fkey"
FOREIGN KEY ("game_id") REFERENCES "games"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "game_localizations" (
    "id", "game_id", "locale", "title", "description",
    "detailed_description", "source", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    "id",
    'pt-BR',
    "title",
    "description",
    "detailed_description",
    'FALLBACK'::"GameLocalizationSource",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "games";
