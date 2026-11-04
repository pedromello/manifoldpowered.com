import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { Prisma, type PriceRefreshItem } from "generated/prisma/client";
import { NotFoundError, ValidationError } from "infra/errors";
import { parseNintendoUrl } from "lib/nintendo";
import { PLAYSTATION_PRODUCT_ID } from "lib/playstation";
import {
  ACTIVE_PRICE_RUNS,
  PRICE_LEASE_MS,
  PRICE_PROVIDERS,
  priceErrorCode,
  retryDelay,
  type CollectedPrice,
  type PriceProvider,
  type PriceCountry,
} from "lib/price_refresh";
import { collectPrice } from "models/price_collection";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const activeWhere = { status: { in: ACTIVE_PRICE_RUNS } };
async function lock(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('catalog-price-refresh'))) AS lock`;
}

export async function candidates(provider = "ALL", limit?: number) {
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { steam_app_id: { not: null } },
        { nintendo_nsuid: { not: null } },
        { playstation_product_id: { not: null } },
      ],
    },
    select: {
      id: true,
      title: true,
      steam_app_id: true,
      nintendo_nsuid: true,
      playstation_product_id: true,
      social_links: true,
      external_offers: { select: { provider: true, country: true, url: true } },
    },
    orderBy: { id: "asc" },
  });
  const items: Omit<Prisma.PriceRefreshItemCreateManyInput, "run_id">[] = [];
  let included = 0;
  for (const game of games) {
    if (limit && included >= limit) break;
    let added = false;
    for (const source of PRICE_PROVIDERS) {
      if (provider !== "ALL" && provider !== source) continue;
      const id =
        source === "STEAM"
          ? game.steam_app_id
          : source === "NINTENDO"
            ? game.nintendo_nsuid
            : game.playstation_product_id;
      if (!id) continue;
      for (const country of ["BR", "US"]) {
        const offers = game.external_offers.filter(
          (o) => o.provider === source,
        );
        const links = game.social_links as Record<string, unknown> | null;
        const fallback =
          source === "NINTENDO" && typeof links?.nintendo_page === "string"
            ? links.nintendo_page
            : null;
        const url =
          offers.find((o) => o.country === country)?.url ??
          offers[0]?.url ??
          fallback;
        const invalid =
          source === "STEAM"
            ? !/^\d+$/.test(id)
            : source === "NINTENDO"
              ? !/^700100\d{8}$/.test(id) || !url || !parseNintendoUrl(url)
              : !PLAYSTATION_PRODUCT_ID.test(id);
        items.push({
          game_id: game.id,
          title: game.title,
          provider: source,
          country,
          external_id: id,
          url,
          status: invalid ? "SKIPPED" : "PENDING",
          error_code: invalid ? "INVALID_REFERENCE" : null,
        });
        added = true;
      }
    }
    if (added) included++;
  }
  return items;
}

export async function createRun(
  provider = "ALL",
  requestedBy?: string,
  limit?: number,
) {
  const items = await candidates(provider, limit);
  return prisma.$transaction(
    async (tx) => {
      await lock(tx);
      const existing = await tx.priceRefreshRun.findFirst({
        where: activeWhere,
      });
      if (existing) return { run: existing, created: false };
      const run = await tx.priceRefreshRun.create({
        data: { provider, requested_by: requestedBy },
      });
      for (let i = 0; i < items.length; i += 500)
        await tx.priceRefreshItem.createMany({
          data: items
            .slice(i, i + 500)
            .map((item) => ({ ...item, run_id: run.id })),
        });
      return { run, created: true };
    },
    { timeout: 30_000 },
  );
}

export async function resumeRun(id: string, retryFailed = false) {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    await tx.$queryRaw`SELECT id FROM price_refresh_runs WHERE id = ${id} FOR UPDATE`;
    const run = await tx.priceRefreshRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundError({ message: "Price refresh not found" });
    if (run.lease_until && run.lease_until > new Date())
      return { run, resumed: false };
    if (
      run.status === "QUEUED" &&
      Date.now() - run.updated_at.getTime() < 10 * 60_000
    )
      return { run, resumed: false };
    const other = await tx.priceRefreshRun.findFirst({
      where: { ...activeWhere, id: { not: id } },
    });
    if (other) return { run: other, resumed: false };
    if (
      !retryFailed &&
      ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(run.status)
    )
      return { run, resumed: false };
    await tx.priceRefreshItem.updateMany({
      where: {
        run_id: id,
        status: { in: retryFailed ? ["FAILED", "RUNNING"] : ["RUNNING"] },
      },
      data: { status: "PENDING", error_code: null },
    });
    return {
      run: await tx.priceRefreshRun.update({
        where: { id },
        data: {
          status: "QUEUED",
          error_code: null,
          lease_until: null,
          lease_token: null,
          finished_at: null,
        },
      }),
      resumed: true,
    };
  });
}

export async function runSummary(id: string) {
  const run = await prisma.priceRefreshRun.findUnique({ where: { id } });
  if (!run) throw new NotFoundError({ message: "Price refresh not found" });
  const groups = await prisma.priceRefreshItem.groupBy({
    by: ["status"],
    where: { run_id: id },
    _count: true,
  });
  const counts = Object.fromEntries(groups.map((g) => [g.status, g._count]));
  const total = groups.reduce((sum, group) => sum + group._count, 0);
  const { lease_token: _token, ...publicRun } = run;
  void _token;
  const stale =
    run.status === "RUNNING"
      ? !run.lease_until || run.lease_until <= new Date()
      : run.status === "QUEUED" &&
        Date.now() - run.updated_at.getTime() > 10 * 60_000;
  return {
    ...publicRun,
    stale,
    counts,
    total,
    checked: (counts.CHANGED ?? 0) + (counts.UNCHANGED ?? 0),
    processed: total - (counts.PENDING ?? 0) - (counts.RUNNING ?? 0),
  };
}

export function priceSnapshot(value: {
  amount: unknown;
  original_amount: unknown;
  currency: string;
  discount_percent: number | null;
  expires_at?: Date | null;
}) {
  return {
    amount:
      value.amount === null
        ? null
        : new Prisma.Decimal(String(value.amount)).toString(),
    original_amount:
      value.original_amount === null
        ? null
        : new Prisma.Decimal(String(value.original_amount)).toString(),
    currency: value.currency,
    discount_percent: value.discount_percent,
    expires_at: value.expires_at?.toISOString() ?? null,
  };
}

async function fence(tx: Prisma.TransactionClient, id: string, token: string) {
  const owned = await tx.priceRefreshRun.updateMany({
    where: {
      id,
      lease_token: token,
      lease_until: { gt: new Date() },
      status: "RUNNING",
    },
    data: { heartbeat_at: new Date() },
  });
  if (!owned.count) throw new Error("PRICE_LEASE_LOST");
}

async function savePrice(
  item: PriceRefreshItem,
  token: string,
  price: CollectedPrice | null,
  error?: string,
) {
  return prisma.$transaction(async (tx) => {
    await fence(tx, item.run_id, token);
    // Shared with full imports; serializes read/check/write, including first offers.
    await tx.$queryRaw`SELECT id FROM games WHERE id = ${item.game_id} FOR UPDATE`;
    const game = await tx.game.findUnique({ where: { id: item.game_id } });
    if (!game) {
      await tx.priceRefreshItem.update({
        where: { id: item.id },
        data: {
          status: "SKIPPED",
          error_code: "GAME_REMOVED",
          checked_at: new Date(),
        },
      });
      return;
    }
    const identity =
      item.provider === "STEAM"
        ? game.steam_app_id
        : item.provider === "NINTENDO"
          ? game.nintendo_nsuid
          : game.playstation_product_id;
    if (identity !== item.external_id) {
      price = null;
      error = "IDENTITY_CHANGED";
    }
    const key = {
      game_id: item.game_id,
      provider: item.provider,
      country: item.country,
    };
    const previous = await tx.gameExternalOffer.findUnique({
      where: { game_id_provider_country: key },
    });
    const before = previous ? priceSnapshot(previous) : Prisma.DbNull;
    let status = error ? "FAILED" : "SKIPPED";
    let reason = error ?? "PRICE_UNAVAILABLE";
    if (price && previous && previous.captured_at >= price.captured_at) {
      price = null;
      reason = "NEWER_PRICE_EXISTS";
    }
    let after: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (price) {
      after = priceSnapshot(price);
      status =
        JSON.stringify(before) === JSON.stringify(after)
          ? "UNCHANGED"
          : "CHANGED";
      reason = null;
      const data = {
        ...price,
        ...key,
        amount: new Prisma.Decimal(price.amount),
        original_amount:
          price.original_amount === null
            ? null
            : new Prisma.Decimal(price.original_amount),
      };
      await tx.gameExternalOffer.upsert({
        where: { game_id_provider_country: key },
        create: data,
        update: data,
      });
      // US is the importer's canonical Steam price; BR must never overwrite it.
      if (
        item.provider === "STEAM" &&
        item.country === "US" &&
        (!game.steam_price_captured_at ||
          game.steam_price_captured_at < price.captured_at)
      )
        await tx.game.update({
          where: { id: game.id },
          data: {
            steam_price: data.amount,
            steam_original_price: data.original_amount,
            steam_discount_percent: price.discount_percent,
            steam_price_currency: price.currency,
            steam_price_captured_at: price.captured_at,
          },
        });
    }
    await tx.priceRefreshItem.update({
      where: { id: item.id },
      data: {
        status,
        before,
        after,
        error_code: reason,
        checked_at: new Date(),
      },
    });
  });
}

export async function executeRun(
  id: string,
  options: { shouldStop?: () => boolean; maxDurationMs?: number } = {},
) {
  const token = randomUUID();
  const now = new Date();
  const acquired = await prisma.priceRefreshRun.updateMany({
    where: {
      id,
      status: { in: ACTIVE_PRICE_RUNS },
      OR: [{ lease_until: null }, { lease_until: { lte: now } }],
    },
    data: {
      status: "RUNNING",
      started_at: now,
      heartbeat_at: now,
      lease_token: token,
      lease_until: new Date(now.getTime() + PRICE_LEASE_MS),
      error_code: null,
    },
  });
  if (!acquired.count) return;
  await prisma.priceRefreshItem.updateMany({
    where: { run_id: id, status: "RUNNING" },
    data: { status: "PENDING" },
  });
  let lost = false;
  const heartbeat = setInterval(() => {
    void prisma.priceRefreshRun
      .updateMany({
        where: {
          id,
          lease_token: token,
          status: "RUNNING",
          lease_until: { gt: new Date() },
        },
        data: {
          heartbeat_at: new Date(),
          lease_until: new Date(Date.now() + PRICE_LEASE_MS),
        },
      })
      .then((r) => {
        if (!r.count) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 10_000);
  const deadline = Date.now() + (options.maxDurationMs ?? 5 * 60 * 60_000);
  const stop = () => lost || options.shouldStop?.() || Date.now() >= deadline;
  const wait = async (ms: number) => {
    const until = Date.now() + ms;
    while (!stop() && Date.now() < until)
      await sleep(Math.min(1000, until - Date.now()));
  };
  try {
    const results = await Promise.allSettled(
      PRICE_PROVIDERS.map(async (provider) => {
        try {
          while (!stop()) {
            const item = await prisma.priceRefreshItem.findFirst({
              where: { run_id: id, provider, status: "PENDING" },
              orderBy: [{ game_id: "asc" }, { country: "asc" }],
            });
            if (!item) break;
            if (item.retry_at) await wait(item.retry_at.getTime() - Date.now());
            if (stop()) break;
            await prisma.$transaction(async (tx) => {
              await fence(tx, id, token);
              await tx.priceRefreshItem.update({
                where: { id: item.id },
                data: { status: "RUNNING" },
              });
            });
            for (let attempt = 1; attempt <= 3 && !stop(); attempt++) {
              await prisma.$transaction(async (tx) => {
                await fence(tx, id, token);
                await tx.priceRefreshItem.update({
                  where: { id: item.id },
                  data: { attempts: { increment: 1 } },
                });
              });
              let price: CollectedPrice | null;
              try {
                price = await collectPrice({
                  provider: provider as PriceProvider,
                  country: item.country as PriceCountry,
                  external_id: item.external_id,
                  url: item.url,
                });
              } catch (error) {
                const delay = retryDelay(error, attempt);
                if (delay !== null) {
                  await prisma.$transaction(async (tx) => {
                    await fence(tx, id, token);
                    await tx.priceRefreshItem.update({
                      where: { id: item.id },
                      data: { retry_at: new Date(Date.now() + delay) },
                    });
                  });
                }
                if (attempt < 3 && delay !== null) {
                  await wait(delay);
                  continue;
                }
                await savePrice(item, token, null, priceErrorCode(error));
                // Rate limits apply to subsequent products too.
                if (delay !== null) await wait(delay);
                break;
              }
              await savePrice(item, token, price);
              break;
            }
            await wait(1000);
          }
        } catch (error) {
          lost = true;
          throw error;
        }
      }),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
    if (!lost) {
      await prisma.$transaction(async (tx) => {
        await fence(tx, id, token);
        const pending = await tx.priceRefreshItem.count({
          where: { run_id: id, status: { in: ["PENDING", "RUNNING"] } },
        });
        const failures = await tx.priceRefreshItem.count({
          where: { run_id: id, status: "FAILED" },
        });
        await tx.priceRefreshRun.update({
          where: { id },
          data: {
            status: pending
              ? "INTERRUPTED"
              : failures
                ? "COMPLETED_WITH_ERRORS"
                : "COMPLETED",
            finished_at: pending ? null : new Date(),
            lease_token: null,
            lease_until: null,
          },
        });
      });
    }
  } catch (error) {
    lost = true;
    await prisma.priceRefreshRun.updateMany({
      where: { id, lease_token: token },
      data: {
        status: "INTERRUPTED",
        error_code: "WORKER_INTERRUPTED",
        lease_token: null,
        lease_until: null,
      },
    });
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export function validateProvider(provider: string) {
  if (
    provider !== "ALL" &&
    !PRICE_PROVIDERS.includes(provider as PriceProvider)
  )
    throw new ValidationError({ message: "Invalid price provider" });
  return provider;
}
