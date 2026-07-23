-- Tag filters are now case-insensitive (stored lowercase). Collapse any
-- existing case-variant duplicates within the same store before lowercasing,
-- keeping the earliest row per (store_id, lower(tag)) so the (store_id, tag)
-- unique constraint is not violated. Tie-break on id when created_at matches.
DELETE FROM "store_tag_filters" a
USING "store_tag_filters" b
WHERE a."store_id" = b."store_id"
  AND lower(a."tag") = lower(b."tag")
  AND (
    a."created_at" > b."created_at"
    OR (a."created_at" = b."created_at" AND a."id" > b."id")
  );

-- Normalize the surviving rows to lowercase.
UPDATE "store_tag_filters" SET "tag" = lower("tag") WHERE "tag" <> lower("tag");
