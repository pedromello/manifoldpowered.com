import {
  assertExactFixtureState,
  assertLocalShowcaseSeedTarget,
  readConfirmedDatabase,
} from "scripts/seed-outlet-preset-showcase-policy";

const localTarget = {
  nodeEnv: "development",
  postgresHost: "localhost",
  postgresDatabase: "local_db",
  confirmedDatabase: "local_db",
} as const;

describe("Outlet preset showcase seed policy", () => {
  test("accepts an explicitly confirmed loopback development database", () => {
    expect(() => assertLocalShowcaseSeedTarget(localTarget)).not.toThrow();
  });

  test.each([
    { ...localTarget, nodeEnv: "production" },
    { ...localTarget, postgresHost: "database.example.com" },
    { ...localTarget, postgresHost: "10.0.0.8" },
    {
      ...localTarget,
      postgresDatabase: "postgres",
      confirmedDatabase: "postgres",
    },
    { ...localTarget, confirmedDatabase: undefined },
    { ...localTarget, confirmedDatabase: "some_other_database" },
  ])("rejects unsafe or unconfirmed target %#", (target) => {
    expect(() => assertLocalShowcaseSeedTarget(target)).toThrow();
  });

  test("parses one exact database confirmation", () => {
    expect(
      readConfirmedDatabase([
        "--origin=http://localhost:3001",
        "--confirm-database=local_db",
      ]),
    ).toBe("local_db");
    expect(() =>
      readConfirmedDatabase([
        "--confirm-database=local_db",
        "--confirm-database=another_db",
      ]),
    ).toThrow("exactly once");
  });

  test("rejects extra or changed fixture rows", () => {
    const expected = [{ id: "filter-1", mode: "WHITELIST" }];
    expect(() =>
      assertExactFixtureState("tag filters", expected, expected),
    ).not.toThrow();
    expect(() =>
      assertExactFixtureState(
        "tag filters",
        [...expected, { id: "filter-2", mode: "BLACKLIST" }],
        expected,
      ),
    ).toThrow("refusing to publish");
  });
});
