-- CreateEnum
CREATE TYPE "GameReleasePatchAlgorithm" AS ENUM ('WHARF');

-- CreateEnum
CREATE TYPE "GameReleasePatchStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable. References intentionally have no foreign keys; referential
-- integrity is enforced by models/game_release_patch.ts.
CREATE TABLE "game_release_patches" (
    "id" TEXT NOT NULL,
    "source_release_id" TEXT NOT NULL,
    "target_release_id" TEXT NOT NULL,
    "platform" "GamePlatform" NOT NULL,
    "architecture" "GameArchitecture" NOT NULL,
    "algorithm" "GameReleasePatchAlgorithm" NOT NULL DEFAULT 'WHARF',
    "format_version" VARCHAR(10) NOT NULL DEFAULT '1',
    "status" "GameReleasePatchStatus" NOT NULL DEFAULT 'PENDING',
    "patch_storage_object_key" VARCHAR(1024) NOT NULL,
    "patch_size_bytes" BIGINT NOT NULL,
    "patch_sha256" CHAR(64) NOT NULL,
    "signature_storage_object_key" VARCHAR(1024) NOT NULL,
    "signature_size_bytes" BIGINT NOT NULL,
    "signature_sha256" CHAR(64) NOT NULL,
    "expected_installation_sha256" CHAR(64) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "generation_duration_ms" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_release_patches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_release_patches_distinct_releases" CHECK ("source_release_id" <> "target_release_id"),
    CONSTRAINT "game_release_patches_patch_size_positive" CHECK ("patch_size_bytes" > 0),
    CONSTRAINT "game_release_patches_signature_size_positive" CHECK ("signature_size_bytes" > 0),
    CONSTRAINT "game_release_patches_generation_duration_nonnegative" CHECK ("generation_duration_ms" >= 0),
    CONSTRAINT "game_release_patches_format_version_v1" CHECK ("format_version" = '1'),
    CONSTRAINT "game_release_patches_expected_signature" CHECK ("expected_installation_sha256" = "signature_sha256")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_release_patches_patch_storage_object_key_key" ON "game_release_patches"("patch_storage_object_key");

-- CreateIndex
CREATE UNIQUE INDEX "game_release_patches_signature_storage_object_key_key" ON "game_release_patches"("signature_storage_object_key");

-- CreateIndex
CREATE UNIQUE INDEX "game_release_patches_source_release_id_target_release_id_pl_key" ON "game_release_patches"("source_release_id", "target_release_id", "platform", "architecture");

-- CreateIndex
CREATE INDEX "game_release_patches_target_release_id_status_idx" ON "game_release_patches"("target_release_id", "status");

-- CreateIndex
CREATE INDEX "game_release_patches_source_release_id_target_release_id_idx" ON "game_release_patches"("source_release_id", "target_release_id");
