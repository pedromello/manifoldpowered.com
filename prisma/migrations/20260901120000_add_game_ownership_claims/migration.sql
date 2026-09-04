-- CreateEnum
CREATE TYPE "GameOwnershipClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "game_ownership_claims" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "status" "GameOwnershipClaimStatus" NOT NULL DEFAULT 'PENDING',
    "rights_attestation_text" TEXT NOT NULL,
    "rights_attestation_version" VARCHAR(32) NOT NULL,
    "rights_attestation_locale" VARCHAR(5) NOT NULL,
    "rights_attested_at" TIMESTAMP(3) NOT NULL,
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_ownership_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_ownership_claims_game_id_status_idx" ON "game_ownership_claims"("game_id", "status");

-- CreateIndex
CREATE INDEX "game_ownership_claims_studio_id_status_idx" ON "game_ownership_claims"("studio_id", "status");

-- CreateIndex
CREATE INDEX "game_ownership_claims_requested_by_user_id_idx" ON "game_ownership_claims"("requested_by_user_id");

-- A studio may have only one open request for a game. Other studios may
-- still submit competing requests, and historical decided requests remain.
CREATE UNIQUE INDEX "game_ownership_claims_one_pending_per_studio_game"
ON "game_ownership_claims"("game_id", "studio_id")
WHERE "status" = 'PENDING';

-- A requester cannot bypass the per-studio limit by creating more Studios.
CREATE UNIQUE INDEX "game_ownership_claims_one_pending_per_requester_game"
ON "game_ownership_claims"("game_id", "requested_by_user_id")
WHERE "status" = 'PENDING';

-- At most one studio can ever be approved as the game's owner.
CREATE UNIQUE INDEX "game_ownership_claims_one_approved_per_game"
ON "game_ownership_claims"("game_id")
WHERE "status" = 'APPROVED';
