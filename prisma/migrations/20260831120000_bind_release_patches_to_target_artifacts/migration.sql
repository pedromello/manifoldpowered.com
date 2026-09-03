-- Bind every incremental patch to the exact target artifact declaration used
-- during generation. References remain logical; there are intentionally no
-- foreign keys in this schema.
ALTER TABLE "game_release_patches"
ADD COLUMN "target_artifact_id" TEXT,
ADD COLUMN "target_artifact_sha256" CHAR(64);

UPDATE "game_release_patches" AS "patch"
SET
    "target_artifact_id" = "artifact"."id",
    "target_artifact_sha256" = "artifact"."sha256"
FROM "game_artifacts" AS "artifact"
WHERE
    "artifact"."release_id" = "patch"."target_release_id"
    AND "artifact"."platform" = "patch"."platform"
    AND "artifact"."architecture" = "patch"."architecture";

ALTER TABLE "game_release_patches"
ALTER COLUMN "target_artifact_id" SET NOT NULL,
ALTER COLUMN "target_artifact_sha256" SET NOT NULL;

CREATE INDEX "game_release_patches_target_artifact_id_status_idx"
ON "game_release_patches"("target_artifact_id", "status");
