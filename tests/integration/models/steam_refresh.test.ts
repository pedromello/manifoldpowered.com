import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import {
  NotFoundError,
  ServiceError,
  TooManyRequestsError,
} from "infra/errors";
import steamImport from "models/steam_import";
import * as coordination from "models/steam_refresh";
import orchestrator from "tests/orchestrator";

const appId = "990000100";
const gateway = () => ({
  fetchAppDetails: jest.fn(async () => ({
    success: true,
    data: {
      name: "Steam Refresh Fixture",
      categories: [{ id: 2, description: "Single Player" }],
      price_overview: { currency: "USD", initial: 2000, final: 1000 },
    },
  })),
});
beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test("100 users share one Steam regional round and cached results", async () => {
  const runId = randomUUID().replace(/-/g, "");
  const users = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      orchestrator.createUser({
        username: `steam-${runId.slice(0, 16)}-${index}`,
        email: `steam-refresh-${runId}-${index}@example.test`,
        password: null,
      }),
    ),
  );
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let start: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const source = gateway();
  const fetchAppDetails = jest.fn(async () => {
    start();
    await gate;
    return source.fetchAppDetails();
  });
  const leader = steamImport.importGame({
    userId: users[0].id,
    steamAppId: appId,
    gateway: { fetchAppDetails },
  });
  await started;
  try {
    const followers = await Promise.all(
      users.slice(1).map((user) =>
        steamImport.importGame({
          userId: user.id,
          steamAppId: appId,
          gateway: { fetchAppDetails },
        }),
      ),
    );
    expect(fetchAppDetails).toHaveBeenCalledTimes(2);
    expect(
      followers.every(
        (r) => r.game === null && r.refresh?.state === "in_progress",
      ),
    ).toBe(true);
    expect(new Set(followers.map((r) => r.refresh?.operation_id)).size).toBe(1);
  } finally {
    release!();
  }
  const imported = await leader;
  const cached = await steamImport.importGame({
    userId: users[1].id,
    steamAppId: appId,
    gateway: { fetchAppDetails },
  });
  expect(cached.refresh?.state).toBe("cached");
  expect(cached.game?.id).toBe(imported.game?.id);
  expect(fetchAppDetails).toHaveBeenCalledTimes(2);
  expect(await prisma.game.count()).toBe(1);
  expect(
    (await coordination.status(imported.refresh!.operation_id)).refresh.state,
  ).toBe("updated");
  expect(await prisma.steamImportAttempt.count()).toBe(101);
});

test("four global slots, abandoned leases and fencing old writers", async () => {
  const first = await coordination.reserve(appId);
  for (let i = 1; i < 4; i++)
    await coordination.reserve(String(Number(appId) + i));
  await expect(coordination.reserve("990000200")).rejects.toBeInstanceOf(
    ServiceError,
  );
  await prisma.steamRefresh.update({
    where: { id: first.row.id },
    data: { lease_expires_at: new Date(0) },
  });
  const replacement = await coordination.reserve(appId);
  expect(replacement.acquired).toBe(true);
  await expect(
    prisma.$transaction((tx) =>
      coordination.complete(tx, first.row, "invalid-game", {}),
    ),
  ).rejects.toThrow("expired");
  await coordination.fail(
    first.row,
    new ServiceError({ message: "old", action: "retry" }),
    {},
  );
  expect(
    (
      await prisma.steamRefresh.findUniqueOrThrow({
        where: { id: first.row.id },
      })
    ).lease_token,
  ).toBe(replacement.row.lease_token);
});

test.each([false, true])(
  "total failures back off without extra upstream calls (not found: %s)",
  async (negative) => {
    const user = await orchestrator.createUser({ password: null });
    const fetchAppDetails = jest.fn(async () => {
      if (negative) return { success: false };
      throw new Error("private source diagnostic");
    });
    const options = {
      userId: user.id,
      steamAppId: appId,
      gateway: { fetchAppDetails },
    };
    await expect(steamImport.importGame(options)).rejects.toBeInstanceOf(
      negative ? NotFoundError : ServiceError,
    );
    await expect(steamImport.importGame(options)).rejects.toBeInstanceOf(
      negative ? NotFoundError : ServiceError,
    );
    expect(fetchAppDetails).toHaveBeenCalledTimes(2);
    const row = await prisma.steamRefresh.findUniqueOrThrow({
      where: { steam_app_id: appId },
    });
    expect(
      row.next_allowed_at!.getTime() - row.last_completed_at!.getTime(),
    ).toBe(negative ? 900000 : 60000);
    expect(JSON.stringify(await coordination.status(row.id))).not.toContain(
      "private source diagnostic",
    );
  },
);

test("refresh preserves unknown prices, capture dates, reviews and confirmed features", async () => {
  const user = await orchestrator.createUser({ password: null });
  const first = await steamImport.importGame({
    userId: user.id,
    steamAppId: appId,
    gateway: gateway(),
  });
  await prisma.review.create({
    data: {
      user_id: user.id,
      game_id: first.game!.id,
      message: "Keep this review",
    },
  });
  const before = await prisma.gameExternalOffer.findMany({
    where: { game_id: first.game!.id },
    orderBy: { country: "asc" },
  });
  await prisma.steamRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  const updated = await steamImport.importGame({
    userId: user.id,
    steamAppId: appId,
    gateway: {
      fetchAppDetails: async () => ({
        success: true,
        data: { name: "Updated name" },
      }),
    },
  });
  expect(updated.game).toMatchObject({
    id: first.game!.id,
    slug: first.game!.slug,
    title: "Updated name",
    meta_tags: { features: { single_player: true } },
    steam_price_captured_at: first.game!.steam_price_captured_at,
  });
  expect(updated.game!.steam_price?.toFixed(2)).toBe("10.00");
  expect(
    await prisma.gameExternalOffer.findMany({
      where: { game_id: first.game!.id },
      orderBy: { country: "asc" },
    }),
  ).toEqual(before);
  expect(await prisma.review.count()).toBe(1);
});

test("cached POSTs count toward user quota while admins still share the interval", async () => {
  const user = await orchestrator.createUser({ password: null });
  const source = gateway();
  const options = { userId: user.id, steamAppId: appId, gateway: source };
  await steamImport.importGame(options);
  for (let i = 1; i < 20; i++) await steamImport.importGame(options);
  await expect(steamImport.importGame(options)).rejects.toBeInstanceOf(
    TooManyRequestsError,
  );
  expect(
    (await steamImport.importGame({ ...options, isAdmin: true })).refresh
      ?.state,
  ).toBe("cached");
  expect(source.fetchAppDetails).toHaveBeenCalledTimes(2);
});

test("moderation during upstream I/O is preserved", async () => {
  const user = await orchestrator.createUser({ password: null });
  const first = await steamImport.importGame({
    userId: user.id,
    steamAppId: appId,
    gateway: gateway(),
  });
  await prisma.steamRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  const updated = await steamImport.importGame({
    userId: user.id,
    steamAppId: appId,
    gateway: {
      fetchAppDetails: async () => {
        await prisma.game.update({
          where: { id: first.game!.id },
          data: { status: "INACTIVE" },
        });
        return { success: true, data: { name: "Untrusted overwrite" } };
      },
    },
  });
  expect(updated.game).toMatchObject({
    status: "INACTIVE",
    title: first.game!.title,
  });
});

test("independent Node processes share the same reservation", async () => {
  const user = await orchestrator.createUser({ password: null });
  const run = (mode: string) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "tests/fixtures/steam-process-worker.ts",
        user.id,
        mode,
      ],
      { env: process.env, windowsHide: true, stdio: "pipe" },
    );
    let output = "",
      errors = "";
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      errors += data.toString();
    });
    const done = new Promise<string>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve(output)
          : reject(new Error(errors || `Worker exited ${code}`)),
      );
    });
    return { child, done };
  };
  const leader = run("leader");
  // Handle errors even while waiting for the worker to reach its mocked upstream.
  void leader.done.catch(() => {});
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Worker did not start")),
        10000,
      );
      leader.child.stdout.on("data", (data: Buffer) => {
        if (data.toString().includes("FETCH")) {
          clearTimeout(timer);
          resolve();
        }
      });
      leader.child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const follower = run("follower");
    try {
      const result = await follower.done;
      expect(result).toContain('"state":"in_progress"');
      expect(result).not.toContain("FETCH");
    } finally {
      follower.child.kill();
    }
    leader.child.stdin.write("release\n");
    expect(await leader.done).toContain('"state":"updated"');
    expect(await prisma.game.count()).toBe(1);
  } finally {
    leader.child.kill();
  }
});
