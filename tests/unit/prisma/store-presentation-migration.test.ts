import fs from "node:fs";
import path from "node:path";

const migrationSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260901120000_add_store_presentation/migration.sql",
  ),
  "utf8",
);

describe("Store presentation lifecycle migration", () => {
  test("backfills legacy Outlets as published immutable revisions", () => {
    expect(migrationSql).toContain('CREATE TABLE "store_revisions"');
    expect(migrationSql).toContain('INSERT INTO "store_revisions"');
    expect(migrationSql).toContain("\"publication_status\" = 'PUBLISHED'");
    expect(migrationSql).toContain('"published_revision_id" = revision."id"');
    expect(migrationSql).toContain('ADD COLUMN "layout_preset" VARCHAR(32),');
    expect(migrationSql).not.toMatch(
      /ADD COLUMN "layout_preset"[^\n]+DEFAULT 'channel'/,
    );
  });

  test("keeps immutable revisions as logical references without foreign keys", () => {
    const statements = migrationSql.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(/FOREIGN KEY\s*\(|REFERENCES\s+"/i);
  });

  test("preserves bespoke themes by explicit allow-listed slug backfill", () => {
    expect(migrationSql).toContain("('neon-alley', 'strategos-void')");
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "stores_theme_key_key"',
    );
  });

  test("adds safe presentation defaults and layout constraints", () => {
    expect(migrationSql).toContain(
      `DEFAULT '{"palette":"manifold","typography":"modern","shape":"soft"}'`,
    );
    expect(migrationSql).toContain(
      "CHECK (\"layout_preset\" IN ('channel', 'editorial', 'community'))",
    );
  });
});
