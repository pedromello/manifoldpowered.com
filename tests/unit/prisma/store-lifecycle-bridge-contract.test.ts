import fs from "node:fs";
import path from "node:path";
import {
  backfillNullSalePointers,
  grantPublishToEligibleOwners,
  reconcileLegacyStoreLifecycle,
  revisionIdentity,
  storeLifecycleBridgeFixtures,
  temporalRevisionForSale,
  type BridgeRevisionFixture,
} from "./_fixtures/store-lifecycle-bridge";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260901090000_add_store_lifecycle/migration.sql",
  ),
  "utf8",
);
const statements = migration.replace(/^\s*--.*$/gm, "");

describe("Store lifecycle bridge fixture oracle", () => {
  test("covers every approved rollout state and legacy Store lifecycle shape", () => {
    expect(Object.keys(storeLifecycleBridgeFixtures).sort()).toEqual([
      "canonical",
      "fresh",
      "legacy_s3",
    ]);

    const legacyStores = storeLifecycleBridgeFixtures.legacy_s3.stores;
    expect(
      legacyStores.some((store) => store.legacyStatus === "PUBLISHED"),
    ).toBe(true);
    expect(
      legacyStores.some(
        (store) =>
          store.legacyStatus === "DRAFT" && store.publishedRevisionId === null,
      ),
    ).toBe(true);
    expect(
      legacyStores.some(
        (store) =>
          store.legacyStatus === "DRAFT" && store.publishedRevisionId !== null,
      ),
    ).toBe(true);
  });

  test("chooses latest same-Store revision at or before the Sale and falls back to earliest", () => {
    const fixture = storeLifecycleBridgeFixtures.legacy_s3;
    const result = Object.fromEntries(
      fixture.sales
        .filter((sale) => sale.storeId !== null)
        .map((sale) => [
          sale.id,
          temporalRevisionForSale(sale, fixture.revisions)?.id,
        ]),
    );

    expect(result).toMatchObject({
      "legacy-sale-before": "s3-published-r1",
      "legacy-sale-between": "s3-published-r1",
      "legacy-sale-after": "s3-published-r2",
    });
  });

  test("fills only null Sale pointers and preserves every non-null pointer", () => {
    const fixture = storeLifecycleBridgeFixtures.legacy_s3;
    const before = new Map(
      fixture.sales.map((sale) => [sale.id, sale.storeRevisionId]),
    );
    const after = backfillNullSalePointers(fixture.sales, fixture.revisions);

    expect(
      after.find((sale) => sale.id === "legacy-sale-existing-pointer")
        ?.storeRevisionId,
    ).toBe("s3-published-r1");
    expect(
      after.find((sale) => sale.id === "legacy-sale-after")?.storeRevisionId,
    ).toBe("s3-published-r2");
    expect(
      after.find((sale) => sale.id === "legacy-global-sale")?.storeRevisionId,
    ).toBeNull();

    for (const sale of after) {
      if (before.get(sale.id) !== null) {
        expect(sale.storeRevisionId).toBe(before.get(sale.id));
      }
    }
  });

  test("aborts on an orphan or cross-Store existing Sale pointer", () => {
    const fixture = storeLifecycleBridgeFixtures.legacy_s3;
    expect(() =>
      backfillNullSalePointers(
        [
          {
            id: "cross-store-sale",
            storeId: "legacy-published",
            storeRevisionId: "s3-unpublished-r1",
            createdAt: "2026-08-12T00:00:00.000Z",
          },
        ],
        fixture.revisions,
      ),
    ).toThrow("invalid existing pointer");
  });

  test("preserves old-S3 revision IDs and created_at values during shape conversion", () => {
    const before =
      storeLifecycleBridgeFixtures.legacy_s3.revisions.map(revisionIdentity);
    const converted = storeLifecycleBridgeFixtures.legacy_s3.revisions.map(
      (revision): BridgeRevisionFixture => ({
        ...revision,
        revision: revision.revision,
        actorUserId: revision.actorUserId,
      }),
    );

    expect(converted.map(revisionIdentity)).toEqual(before);
  });

  test("preserves published pointers, keeps never-published null, and moves unpublished to last", () => {
    const result = Object.fromEntries(
      storeLifecycleBridgeFixtures.legacy_s3.stores.map((store) => [
        store.id,
        reconcileLegacyStoreLifecycle(store),
      ]),
    );

    expect(result["legacy-published"]).toMatchObject({
      status: "PUBLISHED",
      publishedRevisionId: "s3-published-r2",
      publishedAt: "2026-08-10T00:00:00.000Z",
      lastPublishedRevisionId: "s3-published-r2",
      lastPublishedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(result["legacy-draft-never"]).toMatchObject({
      status: "DRAFT",
      publishedRevisionId: null,
      publishedAt: null,
      lastPublishedRevisionId: null,
      lastPublishedAt: null,
    });
    expect(result["legacy-unpublished"]).toMatchObject({
      status: "DRAFT",
      publishedRevisionId: null,
      publishedAt: null,
      lastPublishedRevisionId: "s3-unpublished-r1",
      lastPublishedAt: "2026-08-03T00:00:00.000Z",
    });
  });

  test("grants publish only to activated owners and preserves user timestamps", () => {
    const fixture = storeLifecycleBridgeFixtures.legacy_s3;
    const beforeTimestamps = new Map(
      fixture.users.map((user) => [user.id, user.updatedAt]),
    );
    const after = grantPublishToEligibleOwners(fixture.stores, fixture.users);

    expect(
      after.find((user) => user.id === "owner-eligible")?.features,
    ).toContain("publish:store");
    expect(
      after.find((user) => user.id === "owner-disabled")?.features,
    ).not.toContain("publish:store");
    expect(
      after.find((user) => user.id === "active-non-owner")?.features,
    ).not.toContain("publish:store");
    for (const user of after) {
      expect(user.updatedAt).toBe(beforeTimestamps.get(user.id));
    }
  });
});

describe("Store lifecycle bridge SQL contract", () => {
  test("runs as one explicit transaction", () => {
    expect(statements).toMatch(/^\s*BEGIN\s*;/i);
    expect(statements).toMatch(/COMMIT\s*;\s*$/i);
  });

  test("takes a bridge advisory lock and locks mutable source tables", () => {
    expect(statements).toMatch(/pg_advisory_xact_lock/i);
    for (const table of [
      "stores",
      "store_revisions",
      "sales",
      "users",
      "store_tag_filters",
      "store_game_overrides",
      "store_featured_games",
    ]) {
      expect(statements).toMatch(
        new RegExp(`LOCK\\s+TABLE[\\s\\S]*?"?${table}"?`, "i"),
      );
    }
  });

  test("classifies fresh, legacy_s3, and canonical and aborts unknown shapes", () => {
    expect(statements).toMatch(/fresh/i);
    expect(statements).toMatch(/legacy_s3/i);
    expect(statements).toMatch(/canonical/i);
    expect(statements).toMatch(/RAISE\s+EXCEPTION/i);
  });

  test("guards enum labels and catalog object definitions before reuse", () => {
    expect(statements).toMatch(/pg_enum/i);
    expect(statements).toMatch(/information_schema\.columns/i);
    expect(statements).toMatch(/pg_get_(?:constraintdef|indexdef)/i);
  });

  test("creates legacy compatibility revisions only in the fresh state", () => {
    expect(statements).toMatch(/legacy-['"]?\s*\|\|/i);
    expect(statements).toMatch(
      /INSERT\s+INTO\s+"store_revisions"[\s\S]*?(?:fresh|bridge_state)/i,
    );
  });

  test("does not update revision identity or created_at fields", () => {
    expect(statements).not.toMatch(/SET\s+"?(?:id|created_at)"?\s*=/i);
  });

  test("maps legacy revision columns in place and makes old-only columns nullable", () => {
    expect(statements).toMatch(/revision_number/i);
    expect(statements).toMatch(/created_by/i);
    for (const column of [
      "revision_number",
      "created_by",
      "social_links",
      "brand_tokens",
      "curation_strategy",
    ]) {
      expect(statements).toMatch(
        new RegExp(
          `ALTER\\s+COLUMN\\s+"?${column}"?\\s+DROP\\s+NOT\\s+NULL`,
          "i",
        ),
      );
    }
  });

  test("fills Sale pointers only when null using temporal same-Store attribution", () => {
    expect(statements).toMatch(
      /UPDATE\s+"?sales"?[\s\S]*?store_revision_id[\s\S]*?store_revision_id"?\s+IS\s+NULL/i,
    );
    expect(statements).toMatch(
      /revision\."?created_at"?\s*<=\s*sale\."?created_at"?/i,
    );
    expect(statements).toMatch(/ORDER\s+BY[\s\S]*?created_at[\s\S]*?DESC/i);
    expect(statements).toMatch(/ORDER\s+BY[\s\S]*?created_at[\s\S]*?ASC/i);
  });

  test("grants publish only to activated Store owners without rewriting timestamps", () => {
    const grant = statements.match(
      /UPDATE\s+"users"[\s\S]*?publish:store[\s\S]*?;/i,
    )?.[0];
    expect(grant).toBeDefined();
    expect(grant).toMatch(/owner_id/i);
    expect(grant).toMatch(/update:user/i);
    expect(grant).toMatch(/NOT[\s\S]*?publish:store/i);
    expect(grant).not.toMatch(/updated_at/i);
  });

  test("contains pre-mutation and postcondition aborts for pointers and ownership", () => {
    const raises = statements.match(/RAISE\s+EXCEPTION/gi) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(2);
    expect(statements).toMatch(/last_published_revision_id/i);
    expect(statements).toMatch(/store_revision_id/i);
    expect(statements).toMatch(/revision\."?store_id"?/i);
  });

  test("never performs destructive schema or data reset operations", () => {
    expect(statements).not.toMatch(
      /\b(?:DROP\s+(?:TABLE|TYPE|COLUMN|SCHEMA|DATABASE)|TRUNCATE|migrate\s+reset)\b/i,
    );
  });
});
