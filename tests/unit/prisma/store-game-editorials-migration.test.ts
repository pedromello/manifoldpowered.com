import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260903150000_add_store_game_editorials",
  "migration.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");

describe("Outlet game editorials migration", () => {
  test("creates an independent Outlet × game record", () => {
    expect(migrationSql).toContain('CREATE TABLE "store_game_editorials"');
    expect(migrationSql).toContain(
      '"store_game_editorials_store_id_game_id_key"',
    );
    expect(migrationSql).not.toContain('REFERENCES "store_featured_games"');
  });

  test("adds reviews to immutable revision snapshots", () => {
    expect(migrationSql).toContain(
      "ADD COLUMN \"game_editorials\" JSONB NOT NULL DEFAULT '[]'",
    );
    expect(migrationSql).toContain(
      'jsonb_array_elements(revision."featured_games")',
    );
  });

  test("backfills existing Featured reasons without deleting them", () => {
    expect(migrationSql).toContain('FROM "store_featured_games"');
    expect(migrationSql).toContain('trim("recommendation_reason")');
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+"store_featured_games"/i);
  });
});
