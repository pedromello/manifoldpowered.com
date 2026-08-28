import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260825120000_create_store_follows",
  "migration.sql",
);

describe("store follows migration", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");

  test("keeps logical references free of foreign keys", () => {
    const statements = migration.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(/FOREIGN KEY\s*\(|REFERENCES\s+"/i);
  });

  test("enforces uniqueness and indexes both future access directions", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "store_follows_user_id_store_id_key"',
    );
    expect(migration).toContain(
      'CREATE INDEX "store_follows_user_id_created_at_idx"',
    );
    expect(migration).toContain(
      'CREATE INDEX "store_follows_store_id_created_at_idx"',
    );
  });
});
