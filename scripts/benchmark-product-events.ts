import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { prisma } from "infra/database";
import { selectionProductFunnel } from "models/product_event_reports";

// This benchmark writes synthetic rows only to a local database and deletes its own run.
if (
  !["localhost", "127.0.0.1", "::1"].includes(
    process.env.POSTGRES_HOST ?? "",
  ) ||
  process.env.NODE_ENV === "production"
) {
  throw new Error("Benchmark requires a local, non-production database");
}
const run = randomUUID();
const selectionId = randomUUID(),
  revisionId = randomUUID(),
  storeId = randomUUID(),
  gameId = randomUUID();
const actorIds = Array.from(
  { length: 1000 },
  (_, n) => "benchmark-user-" + run + "-" + n,
);
const visitIds = actorIds.map(() => randomUUID()),
  anonymousIds = actorIds.map(() => randomUUID());
const base = Date.now() - 3600_000;
const prefix = "benchmark:" + run + ":";
const httpIds: string[] = [];
const origin = "http://localhost:3000";
try {
  await prisma.storeSelectionRevision.create({
    data: {
      id: revisionId,
      selection_id: selectionId,
      revision: 1,
      source_draft_revision: 1,
      actor_user_id: actorIds[0],
      snapshot: {
        title: "Synthetic benchmark",
        description: "",
        cover_url: null,
        image_urls: [],
        game_ids: [gameId],
      },
    },
  });
  const start = performance.now();
  for (let offset = 0; offset < 100_000; offset += 1000) {
    await prisma.productEvent.createMany({
      data: Array.from({ length: 1000 }, (_, local) => {
        const n = offset + local,
          actor = Math.floor(n / 4) % actorIds.length;
        const name = [
          "selection_viewed",
          "game_wishlisted",
          "outlet_followed",
          "public_page_viewed",
        ][n % 4];
        const client = n % 4 === 0 || n % 4 === 3;
        return {
          event_key: prefix + n,
          name,
          schema_version: 1,
          source: client ? "CLIENT" : "SERVER",
          user_id: actorIds[actor],
          visit_id: visitIds[actor],
          anonymous_id: anonymousIds[actor],
          selection_id: name === "selection_viewed" ? selectionId : null,
          store_id: storeId,
          game_id: name === "game_wishlisted" ? gameId : null,
          occurred_at: new Date(base + n * 10),
          received_at: new Date(base + n * 10),
          properties:
            name === "selection_viewed"
              ? { published_revision_id: revisionId, published_revision: 1 }
              : {},
        };
      }),
    });
  }
  const insertMs = performance.now() - start;
  await prisma.$executeRawUnsafe("ANALYZE product_events");
  const queryStart = performance.now();
  const funnel = await selectionProductFunnel(
    new Date(base - 1000),
    new Date(),
    selectionId,
  );
  const queryMs = performance.now() - queryStart;
  const indexPlans =
    await prisma.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT id FROM product_events WHERE visit_id = ${visitIds[0]}::uuid AND occurred_at >= ${new Date(base)} ORDER BY occurred_at`;
  const size = await prisma.$queryRaw<
    Array<{ bytes: bigint }>
  >`SELECT pg_total_relation_size('product_events') AS bytes`;
  const clients = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const response = await fetch(origin + "/api/v1/events", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bootstrap" }),
      });
      if (response.status !== 200)
        throw new Error("Bootstrap status " + response.status);
      return {
        generation: (await response.json()).generation,
        cookie: response.headers
          .getSetCookie()
          .map((v) => v.split(";")[0])
          .join("; "),
      };
    }),
  );
  const measurements = await Promise.all(
    clients.map(async (client) => {
      const events = Array.from({ length: 10 }, () => {
        const id = randomUUID();
        httpIds.push("client:" + id);
        return {
          id,
          name: "public_page_viewed",
          schema_version: 1,
          client_occurred_at: new Date().toISOString(),
          target: {},
          properties: {
            locale: "en",
            entry_surface: "catalog",
            page_kind: "catalog",
          },
        };
      });
      const started = performance.now();
      const response = await fetch(origin + "/api/v1/events", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: client.cookie,
        },
        body: JSON.stringify({
          type: "events",
          context_generation: client.generation,
          events,
        }),
      });
      return { ms: performance.now() - started, status: response.status };
    }),
  );
  const sorted = measurements.map((m) => m.ms).sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        fixture_rows: 100_000,
        concurrency: 50,
        batch_size: 10,
        insert_ms: Math.round(insertMs),
        funnel_ms: Math.round(queryMs),
        funnel: funnel.map(({ selection_id: _selection, ...counts }) => counts),
        p50_ms: Math.round(sorted[24]),
        p95_ms: Math.round(sorted[47]),
        statuses: measurements.reduce(
          (counts, m) => ({
            ...counts,
            [m.status]: (counts[m.status] ?? 0) + 1,
          }),
          {} as Record<number, number>,
        ),
        table_and_indexes_bytes: String(size[0].bytes),
        visit_query_plan: indexPlans,
        note: "Local development server and database; not a production capacity guarantee.",
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.productEvent.deleteMany({
    where: {
      OR: [
        { event_key: { startsWith: prefix } },
        { event_key: { in: httpIds } },
      ],
    },
  });
  await prisma.storeSelectionRevision.deleteMany({ where: { id: revisionId } });
  await prisma.$disconnect();
}
