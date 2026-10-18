import { prismaMigrationHost } from "infra/prisma-host";

test("Prisma CLI uses the direct endpoint of the same Neon compute", () => {
  expect(
    prismaMigrationHost("ep-example-123-pooler.c-3.us-east-1.aws.neon.tech"),
  ).toBe("ep-example-123.c-3.us-east-1.aws.neon.tech");
  expect(prismaMigrationHost("ep-example-123.us-east-1.aws.neon.tech")).toBe(
    "ep-example-123.us-east-1.aws.neon.tech",
  );
});

test.each([
  "localhost",
  "127.0.0.1",
  "postgres.internal",
  "example-pooler.database.test",
  "ep-example-pooler.aws.neon.tech.other.test",
  undefined,
])("preserves non-Neon/local hosts: %s", (host) => {
  expect(prismaMigrationHost(host)).toBe(host);
});

test("an explicitly configured migration host takes precedence", () => {
  expect(
    prismaMigrationHost("ep-example-pooler.aws.neon.tech", "direct.internal"),
  ).toBe("direct.internal");
});
