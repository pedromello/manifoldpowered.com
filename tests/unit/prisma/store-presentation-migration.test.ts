import fs from "node:fs";
import path from "node:path";

const migrationSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260901130000_add_store_presentation_draft/migration.sql",
  ),
  "utf8",
);

describe("Store presentation draft migration", () => {
  test("adds only mutable presentation fields", () => {
    expect(migrationSql).not.toContain('CREATE TABLE "store_revisions"');
    expect(migrationSql).not.toContain("publication_status");
    expect(migrationSql).not.toContain("published_revision_id");
    expect(migrationSql).toContain(
      'ADD COLUMN IF NOT EXISTS "layout_preset" VARCHAR(32),',
    );
    expect(migrationSql).not.toMatch(
      /ADD COLUMN IF NOT EXISTS "layout_preset"[^\n]+DEFAULT 'channel'/,
    );
  });

  test("keeps schema references logical", () => {
    const statements = migrationSql.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(/FOREIGN KEY\s*\(|REFERENCES\s+"/i);
  });

  test("preserves bespoke themes by an explicit platform backfill", () => {
    expect(migrationSql).toContain("('neon-alley', 'strategos-void')");
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "stores_theme_key_key"',
    );
  });

  test("adds safe defaults and preserves null as the classic layout", () => {
    expect(migrationSql).toContain(
      `'{"palette":"manifold","typography":"modern","shape":"soft"}'`,
    );
    expect(migrationSql).toContain(
      "OR \"layout_preset\" IN ('channel', 'editorial', 'community')",
    );
  });

  test("scopes the constraint lookup to public.stores", () => {
    expect(migrationSql).toContain(
      "AND conrelid = to_regclass('public.stores')",
    );
  });
});
