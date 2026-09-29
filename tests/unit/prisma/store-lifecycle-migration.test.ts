import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260901090000_add_store_lifecycle",
    "migration.sql",
  ),
  "utf8",
);

describe("Store lifecycle migration", () => {
  test("atomically grants publication to existing eligible Outlet owners", () => {
    expect(migration).toContain("array_append(\"features\", 'publish:store')");
    expect(migration).toContain('"id" IN (SELECT "owner_id" FROM "stores")');
    expect(migration).toContain("\"features\" @> ARRAY['update:user']::TEXT[]");
    expect(migration).toContain(
      "NOT \"features\" @> ARRAY['publish:store']::TEXT[]",
    );
  });
});
