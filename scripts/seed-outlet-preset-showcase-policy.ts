import { isDeepStrictEqual } from "node:util";

const LOCAL_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const CONFIRM_DATABASE_PREFIX = "--confirm-database=";

type ShowcaseSeedTarget = {
  nodeEnv?: string;
  postgresHost?: string;
  postgresDatabase?: string;
  confirmedDatabase?: string;
};

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function readConfirmedDatabase(
  arguments_: readonly string[],
): string | undefined {
  const confirmations = arguments_.filter((argument) =>
    argument.startsWith(CONFIRM_DATABASE_PREFIX),
  );
  if (confirmations.length > 1) {
    throw new Error("Pass --confirm-database exactly once.");
  }
  return confirmations[0]?.slice(CONFIRM_DATABASE_PREFIX.length);
}

function assertLocalShowcaseSeedTarget(target: ShowcaseSeedTarget): void {
  if (target.nodeEnv === "production") {
    throw new Error(
      "Refusing to seed visual-QA fixtures while NODE_ENV=production.",
    );
  }

  const host = target.postgresHost && normalizeHost(target.postgresHost);
  if (!host || !LOCAL_DATABASE_HOSTS.has(host)) {
    throw new Error(
      "Refusing to seed visual-QA fixtures unless POSTGRES_HOST is an explicit loopback host.",
    );
  }

  const database = target.postgresDatabase?.trim();
  if (!database || SYSTEM_DATABASES.has(database.toLowerCase())) {
    throw new Error(
      "Refusing to seed visual-QA fixtures into a missing or system PostgreSQL database.",
    );
  }

  if (target.confirmedDatabase !== database) {
    throw new Error(
      `Confirm the local target explicitly with --confirm-database=${database}.`,
    );
  }
}

function assertExactFixtureState<T>(
  label: string,
  actual: readonly T[],
  expected: readonly T[],
): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `Fixture ${label} is not exact; refusing to publish an unexpected draft.`,
    );
  }
}

export {
  assertExactFixtureState,
  assertLocalShowcaseSeedTarget,
  readConfirmedDatabase,
};
export type { ShowcaseSeedTarget };
