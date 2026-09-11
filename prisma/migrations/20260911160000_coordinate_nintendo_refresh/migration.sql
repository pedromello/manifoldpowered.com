CREATE TABLE "nintendo_refreshes" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "game_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'IDLE',
    "last_completed_at" TIMESTAMP(3),
    "next_allowed_at" TIMESTAMP(3),
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "error_name" TEXT,
    "error_message" TEXT,
    "regional_outcomes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nintendo_refreshes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nintendo_refreshes_identity_key" ON "nintendo_refreshes"("identity");
CREATE INDEX "nintendo_refreshes_game_id_idx" ON "nintendo_refreshes"("game_id");
CREATE INDEX "nintendo_refreshes_lease_expires_at_idx" ON "nintendo_refreshes"("lease_expires_at");
