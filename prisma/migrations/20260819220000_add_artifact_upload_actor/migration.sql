-- Record the authenticated publisher who initiated each direct artifact upload.
-- Nullable keeps existing pending artifacts deployable; the new upload workflow
-- always supplies this value.
ALTER TABLE "game_artifacts" ADD COLUMN "created_by_user_id" TEXT;

-- Existing activated studio owners need the route-level feature gate that new
-- owners receive from MEMBER_PERMISSIONS. Members do not gain this new
-- publishing capability implicitly; an owner must grant it explicitly.
UPDATE "users"
SET
  "features" = array_append("features", 'create:game_artifact'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "id" IN (SELECT "owner_id" FROM "studios")
  AND "features" @> ARRAY['update:user']::TEXT[]
  AND NOT "features" @> ARRAY['create:game_artifact']::TEXT[];
