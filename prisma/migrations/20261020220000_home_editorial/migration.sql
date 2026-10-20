CREATE TABLE "home_editorial" (
  "id" TEXT NOT NULL DEFAULT 'home',
  "selection_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updated_by" TEXT,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "home_editorial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "home_editorial_singleton" CHECK ("id" = 'home'),
  CONSTRAINT "home_editorial_selection_limit" CHECK (cardinality("selection_ids") <= 3)
);
INSERT INTO "home_editorial" ("id") VALUES ('home');
