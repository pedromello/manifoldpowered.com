-- CreateEnum
CREATE TYPE "GameArchitecture" AS ENUM ('X86_64', 'AARCH64');

-- CreateEnum
CREATE TYPE "GameArchiveFormat" AS ENUM ('ZIP', 'TAR_GZ');

-- CreateEnum
CREATE TYPE "GameReleaseStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PUBLISHED', 'FAILED', 'RETIRED');

-- CreateEnum
CREATE TYPE "GameArtifactStatus" AS ENUM ('PENDING', 'VERIFYING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "game_releases" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "release_number" INTEGER NOT NULL,
    "status" "GameReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "release_notes" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_releases_release_number_positive" CHECK ("release_number" > 0),
    CONSTRAINT "game_releases_published_at_required" CHECK ("status" NOT IN ('PUBLISHED', 'RETIRED') OR "published_at" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "game_artifacts" (
    "id" TEXT NOT NULL,
    "release_id" TEXT NOT NULL,
    "platform" "GamePlatform" NOT NULL,
    "architecture" "GameArchitecture" NOT NULL,
    "archive_format" "GameArchiveFormat" NOT NULL,
    "storage_object_key" VARCHAR(1024) NOT NULL,
    "compressed_size_bytes" BIGINT,
    "installed_size_bytes" BIGINT,
    "sha256" CHAR(64),
    "manifest_schema_version" VARCHAR(10),
    "manifest" JSONB,
    "status" "GameArtifactStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_artifacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_artifacts_compressed_size_nonnegative" CHECK ("compressed_size_bytes" IS NULL OR "compressed_size_bytes" >= 0),
    CONSTRAINT "game_artifacts_installed_size_nonnegative" CHECK ("installed_size_bytes" IS NULL OR "installed_size_bytes" >= 0),
    CONSTRAINT "game_artifacts_ready_metadata_required" CHECK (
        "status" <> 'READY' OR (
            "compressed_size_bytes" IS NOT NULL AND
            "installed_size_bytes" IS NOT NULL AND
            "sha256" IS NOT NULL AND
            "manifest_schema_version" IS NOT NULL AND
            "manifest" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "game_releases_game_id_release_number_key" ON "game_releases"("game_id", "release_number");

-- CreateIndex
CREATE INDEX "game_releases_game_id_status_release_number_idx" ON "game_releases"("game_id", "status", "release_number");

-- CreateIndex
CREATE UNIQUE INDEX "game_artifacts_storage_object_key_key" ON "game_artifacts"("storage_object_key");

-- CreateIndex
CREATE UNIQUE INDEX "game_artifacts_release_id_platform_architecture_key" ON "game_artifacts"("release_id", "platform", "architecture");

-- CreateIndex
CREATE INDEX "game_artifacts_release_id_status_idx" ON "game_artifacts"("release_id", "status");
