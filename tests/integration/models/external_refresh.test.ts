import { prisma } from "infra/database";
import { ServiceError } from "infra/errors";
import * as nintendo from "models/nintendo_refresh";
import * as steam from "models/steam_refresh";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test("concurrent references never acquire overlapping leases or mix provider operations", async () => {
  const [nintendoResults, steamResults] = await Promise.all([
    Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        nintendo.reserve("990003001", i % 2 ? "US" : "BR"),
      ),
    ),
    Promise.all(Array.from({ length: 12 }, () => steam.reserve("990003001"))),
  ]);
  for (const results of [nintendoResults, steamResults]) {
    expect(new Set(results.map((result) => result.row.id)).size).toBe(1);
    const tokens = new Set(results.map((result) => result.row.lease_token));
    for (const token of tokens) {
      expect(token).not.toBeNull();
      const owners = results.filter(
        (result) => result.acquired && result.row.lease_token === token,
      );
      expect(owners).toHaveLength(1);
    }
    const owners = results
      .filter((result) => result.acquired)
      .sort(
        (left, right) =>
          left.row.lease_expires_at!.getTime() -
          right.row.lease_expires_at!.getTime(),
      );
    expect(owners.length).toBeGreaterThanOrEqual(1);
    // A slow environment may legitimately elect another owner after 30 seconds.
    // Exclusivity applies to lease intervals, not the entire concurrent batch.
    for (let i = 1; i < owners.length; i++) {
      const nextStart = owners[i].row.lease_expires_at!.getTime() - 30000;
      expect(nextStart).toBeGreaterThanOrEqual(
        owners[i - 1].row.lease_expires_at!.getTime(),
      );
    }
  }
  expect(nintendoResults[0].row.id).not.toBe(steamResults[0].row.id);
});

test("each provider retains its own four slots and capacity response", async () => {
  for (let i = 0; i < 4; i++) {
    const results = await Promise.all([
      nintendo.reserve(`game-${i}`),
      steam.reserve(`99000400${i}`),
    ]);
    expect(results.every((result) => result.acquired)).toBe(true);
  }
  await expect(nintendo.reserve("game-five")).rejects.toMatchObject({
    name: "ServiceError",
    message: "Nintendo updates are busy. Try again shortly.",
    context: { retry_after: 2 },
  });
  await expect(steam.reserve("990004005")).rejects.toMatchObject({
    name: "ServiceError",
    message: "Steam updates are busy. Try again shortly.",
    context: { retry_after: 2 },
  });
  expect(
    await prisma.nintendoRefresh.count({ where: { state: "RUNNING" } }),
  ).toBe(4);
  expect(await prisma.steamRefresh.count({ where: { state: "RUNNING" } })).toBe(
    4,
  );
});

test("an expired Nintendo worker cannot persist failure even before a successor exists", async () => {
  const { row } = await nintendo.reserve("abandoned-switch");
  const expired = await prisma.nintendoRefresh.update({
    where: { id: row.id },
    data: { lease_expires_at: new Date(0) },
  });
  await nintendo.fail(
    row,
    new ServiceError({ message: "Late failure", action: "Retry" }),
    { BR: "TIMEOUT" },
  );
  expect(
    await prisma.nintendoRefresh.findUnique({ where: { id: row.id } }),
  ).toEqual(expired);
  expect((await nintendo.status(row.id)).refresh).toMatchObject({
    state: "failed",
    message: "This Nintendo update expired. Try again.",
    last_completed_at: null,
    next_allowed_at: null,
  });
  const replacement = await nintendo.reserve("abandoned-switch");
  expect(replacement.acquired).toBe(true);
  expect(replacement.row.lease_token).not.toBe(row.lease_token);
});

test("an expired Steam worker cannot persist failure even before a successor exists", async () => {
  const { row } = await steam.reserve("990005001");
  const expired = await prisma.steamRefresh.update({
    where: { id: row.id },
    data: { lease_expires_at: new Date(0) },
  });
  await steam.fail(
    row,
    new ServiceError({ message: "Late failure", action: "Retry" }),
    { US: "TIMEOUT" },
  );
  expect(
    await prisma.steamRefresh.findUnique({ where: { id: row.id } }),
  ).toEqual(expired);
  expect((await steam.status(row.id)).refresh).toMatchObject({
    state: "failed",
    message: "This Steam update expired. Try again.",
    last_completed_at: null,
    next_allowed_at: null,
  });
  const replacement = await steam.reserve("990005001");
  expect(replacement.acquired).toBe(true);
  expect(replacement.row.lease_token).not.toBe(row.lease_token);
});

test("cached failures retain legacy provider error contracts", async () => {
  const nintendoReservation = await nintendo.reserve("failed-switch");
  const steamReservation = await steam.reserve("990006001");
  const error = new ServiceError({
    message: "Source is unavailable",
    action: "Retry",
  });
  await nintendo.fail(nintendoReservation.row, error, { BR: "TIMEOUT" });
  await steam.fail(steamReservation.row, error, { US: "TIMEOUT" });
  const nintendoFailure = nintendo.failure(
    (await nintendo.reserve("failed-switch")).row,
  );
  const steamFailure = steam.failure((await steam.reserve("990006001")).row);
  expect(nintendoFailure).toMatchObject({
    context: {
      refresh: { state: "failed", operation_id: nintendoReservation.row.id },
    },
  });
  expect(steamFailure).toMatchObject({ context: undefined });
  expect(nintendoFailure.message).toBe(error.message);
  expect(steamFailure.message).toBe(error.message);
});
