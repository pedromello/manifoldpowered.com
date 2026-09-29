import { prisma } from "infra/database";
import { parseNintendoProduct } from "infra/nintendo";
import { NotFoundError, ServiceError } from "infra/errors";
import nintendoImport from "models/nintendo_import";
import * as coordination from "models/nintendo_refresh";
import { nintendoHtml } from "tests/fixtures/nintendo";
import { nintendoProductUrl, type NintendoCountry } from "lib/nintendo";
import orchestrator from "tests/orchestrator";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const slug = "test-knight-switch";
const url = nintendoProductUrl(slug, "BR");
const product = (country: NintendoCountry) =>
  parseNintendoProduct(
    nintendoHtml(country),
    nintendoProductUrl(slug, country),
  );

test("polling does not expose internal error details", async () => {
  const user = await orchestrator.createUser({ password: null });
  await expect(
    nintendoImport.importGame({
      userId: user.id,
      eshopUrl: url,
      gateway: {
        fetchProduct: async () => {
          throw new Error("private database diagnostic");
        },
      },
    }),
  ).rejects.toThrow("Nintendo import failed.");
  const row = await prisma.nintendoRefresh.findFirstOrThrow();
  expect((await coordination.status(row.id)).refresh.message).toBe(
    "Nintendo import failed.",
  );
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test("100 users share one regional round; polling and BR/US cache hits do not fetch", async () => {
  const runId = randomUUID().replace(/-/g, "");
  const users = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      orchestrator.createUser({
        username: `nintendo-${runId.slice(0, 16)}-${index}`,
        email: `nintendo-refresh-${runId}-${index}@example.test`,
        password: null,
      }),
    ),
  );
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fetchProduct = jest.fn(
    async (_slug: string, country: NintendoCountry) => {
      started();
      await gate;
      return product(country);
    },
  );
  const first = nintendoImport.importGame({
    userId: users[0].id,
    eshopUrl: url,
    gateway: { fetchProduct },
  });
  await start;
  const followers = await Promise.all(
    users.slice(1).map((user, i) =>
      nintendoImport.importGame({
        userId: user.id,
        eshopUrl: nintendoProductUrl(slug, i % 2 ? "BR" : "US"),
        gateway: { fetchProduct },
      }),
    ),
  );
  expect(fetchProduct).toHaveBeenCalledTimes(2);
  expect(
    followers.every(
      (r) => r.refresh.state === "in_progress" && r.game === null,
    ),
  ).toBe(true);
  expect(new Set(followers.map((r) => r.refresh.operation_id)).size).toBe(1);
  release!();
  const created = await first;
  expect(created.created).toBe(true);
  expect(
    (await coordination.status(followers[0].refresh.operation_id)).game?.id,
  ).toBe(created.game!.id);
  const cached = await nintendoImport.importGame({
    userId: users[1].id,
    eshopUrl: nintendoProductUrl(slug, "US"),
    isAdmin: true,
    gateway: { fetchProduct },
  });
  expect(cached.refresh.state).toBe("cached");
  expect(fetchProduct).toHaveBeenCalledTimes(2);
  expect(await prisma.game.count()).toBe(1);
  expect(await prisma.nintendoImportAttempt.count()).toBe(101);
});

test("four leases across different identities bound the provider, and expiration recovers capacity", async () => {
  const reservations = await Promise.all(
    ["one", "two", "three", "four"].map((key) => coordination.reserve(key)),
  );
  expect(reservations.every((r) => r.acquired)).toBe(true);
  await expect(coordination.reserve("five")).rejects.toThrow(
    "Nintendo updates are busy",
  );
  await prisma.nintendoRefresh.update({
    where: { id: reservations[0].row.id },
    data: { lease_expires_at: new Date(0) },
  });
  expect((await coordination.reserve("five")).acquired).toBe(true);
});

test("expired workers cannot write data or release a newer worker's lease", async () => {
  const user = await orchestrator.createUser();
  let release: () => void;
  let started: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const stale = nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway: {
      fetchProduct: async (_s, country) => {
        started();
        await gate;
        return product(country);
      },
    },
  });
  const rejected = expect(stale).rejects.toThrow("expired");
  await start;
  const row = await prisma.nintendoRefresh.findFirstOrThrow();
  await prisma.nintendoRefresh.update({
    where: { id: row.id },
    data: { lease_expires_at: new Date(0) },
  });
  expect((await coordination.status(row.id)).refresh.state).toBe("failed");
  const newer = await coordination.reserve(slug);
  release!();
  await rejected;
  expect(await prisma.game.count()).toBe(0);
  expect(
    (await prisma.nintendoRefresh.findUniqueOrThrow({ where: { id: row.id } }))
      .lease_token,
  ).toBe(newer.row.lease_token);
});

test.each([false, true])(
  "failures are shared with the correct backoff (not found=%s)",
  async (notFound) => {
    const user = await orchestrator.createUser();
    const error = notFound
      ? new NotFoundError({ message: "Not found", action: "Check" })
      : new ServiceError({ message: "Timeout", context: "TIMEOUT" });
    const fetchProduct = jest.fn(async () => {
      throw error;
    });
    await expect(
      nintendoImport.importGame({
        userId: user.id,
        eshopUrl: url,
        gateway: { fetchProduct },
      }),
    ).rejects.toThrow();
    await expect(
      nintendoImport.importGame({
        userId: user.id,
        eshopUrl: url,
        gateway: { fetchProduct },
      }),
    ).rejects.toThrow();
    expect(fetchProduct).toHaveBeenCalledTimes(2);
    const row = await prisma.nintendoRefresh.findFirstOrThrow();
    expect(
      row.next_allowed_at!.getTime() - row.last_completed_at!.getTime(),
    ).toBe(notFound ? 900000 : 60000);
    expect(row.regional_outcomes).toEqual({
      BR: notFound ? "NotFoundError" : "TIMEOUT",
      US: notFound ? "NotFoundError" : "TIMEOUT",
    });
  },
);

test("expiry fetches again; known aliases share NSUID and editions stay separate", async () => {
  const user = await orchestrator.createUser();
  const fetchProduct = jest.fn(async (_s: string, country: NintendoCountry) =>
    product(country),
  );
  const imported = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway: { fetchProduct },
  });
  await prisma.nintendoRefresh.create({
    data: { identity: "slug:old-name", game_id: imported.game!.id },
  });
  expect(
    (
      await nintendoImport.importGame({
        userId: user.id,
        eshopUrl: nintendoProductUrl("old-name", "BR"),
        gateway: { fetchProduct },
      })
    ).refresh.state,
  ).toBe("cached");
  await prisma.nintendoRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway: { fetchProduct },
  });
  expect(fetchProduct).toHaveBeenCalledTimes(4);
  expect((await coordination.reserve("test-knight-switch-2")).acquired).toBe(
    true,
  );
});

test("independent Node processes share the same reservation", async () => {
  const user = await orchestrator.createUser({ password: null });
  const run = (mode: string) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "tests/fixtures/nintendo-process-worker.ts",
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

test("a known regional identity mismatch cannot reuse another region's cached edition", async () => {
  const user = await orchestrator.createUser({ password: null });
  const gateway = {
    fetchProduct: async (_slug: string, country: NintendoCountry) =>
      parseNintendoProduct(
        nintendoHtml(
          country,
          country === "US" ? { nsuid: "70010000117998" } : {},
        ),
        nintendoProductUrl(slug, country),
      ),
  };
  const br = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway,
  });
  expect(
    (await coordination.status(br.refresh.operation_id, "US")).refresh.state,
  ).toBe("failed");
  const us = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: nintendoProductUrl(slug, "US"),
    gateway,
  });
  expect(us.created).toBe(true);
  expect(us.game!.id).not.toBe(br.game!.id);
  const cachedBr = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: url,
    gateway,
  });
  const cachedUs = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: nintendoProductUrl(slug, "US"),
    gateway,
  });
  expect(cachedBr.game!.id).toBe(br.game!.id);
  expect(cachedUs.game!.id).toBe(us.game!.id);
});
