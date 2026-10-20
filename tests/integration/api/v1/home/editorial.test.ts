import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import storeSelection from "models/store_selection";
import {
  gameMatchesCatalogSnapshot,
  catalogMatchTags,
  getSnapshotCurationWhereClause,
  type StoreCatalogSnapshot,
} from "models/store_catalog";
import {
  authenticatedJsonHeaders,
  createReadyDraft,
  publicationRequest,
  type ReadyDraftFixture,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(() => orchestrator.waitForAllServices());
beforeEach(() => orchestrator.clearDatabaseRows());
afterAll(() => prisma.$disconnect());
const url = (path: string) => `${webserver.getOrigin()}/api/v1/${path}`;
async function fixture() {
  const f = await createReadyDraft("Home editorial");
  expect(
    (
      await publicationRequest(
        f.store.slug,
        f.sessionToken,
        "publish",
        f.store.draft_revision,
      )
    ).status,
  ).toBe(200);
  return f;
}
async function selection(f: ReadyDraftFixture, slug: string) {
  const row = await storeSelection.create(f.store.id, {
    slug,
    title: `Published ${slug}`,
    description: "A published selection for the home.",
    cover_url: "https://example.com/art.jpg",
    game_slugs: f.games.slice(0, 3).map(({ slug }) => slug),
  });
  await storeSelection.publish(
    f.store.id,
    row.slug,
    f.user.id,
    row.draft_revision,
  );
  return prisma.storeSelection.findUniqueOrThrow({ where: { id: row.id } });
}
async function admin() {
  const user = await orchestrator.createAdminUser();
  const session = await orchestrator.createSession(user.id);
  return { user, headers: authenticatedJsonHeaders(session.token) };
}
async function put(
  headers: Record<string, string>,
  ids: string[],
  revision: number,
) {
  return fetch(url("backoffice/home"), {
    method: "PUT",
    headers,
    body: JSON.stringify({ selection_ids: ids, expected_revision: revision }),
  });
}
async function home() {
  const response = await fetch(url("public/home?locale=pt-BR"), {
    headers: { "x-vercel-ip-country": "BR" },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return response.json();
}

test("denies anonymous and outlet-owner edits; saves ordered published editions, audits once, and detects conflicts", async () => {
  const f = await fixture();
  const first = await selection(f, "first");
  const second = await selection(f, "second");
  expect((await fetch(url("backoffice/home"))).status).toBe(403);
  expect(
    (await put(authenticatedJsonHeaders(f.sessionToken), [first.id], 0)).status,
  ).toBe(403);
  const a = await admin();
  expect((await put(a.headers, [first.id, first.id], 0)).status).toBe(400);
  const saved = await put(a.headers, [second.id, first.id], 0);
  expect(saved.status).toBe(200);
  expect((await saved.json()).revision).toBe(1);
  await storeSelection.update(f.store.id, first.slug, {
    title: "Private draft title",
    expected_draft_revision: first.draft_revision,
  });
  const publicView = await home();
  expect(publicView.mode).toBe("manual");
  expect(publicView.selections.map((entry) => entry.selection.id)).toEqual([
    second.id,
    first.id,
  ]);
  expect(JSON.stringify(publicView)).not.toContain("Private draft title");
  expect(publicView.communities[0].games.map(({ slug }) => slug)).toEqual([
    f.games[0].slug,
  ]);
  expect(publicView.communities[0]).not.toHaveProperty("owner_id");
  const simultaneous = await Promise.all([
    put(a.headers, [first.id], 1),
    put(a.headers, [second.id], 1),
  ]);
  expect(simultaneous.map(({ status }) => status).sort()).toEqual([200, 409]);
  expect(
    await prisma.adminActionLog.count({
      where: { action: "UPDATE_HOME_EDITORIAL" },
    }),
  ).toBe(2);
  const state = await prisma.homeEditorial.findUniqueOrThrow({
    where: { id: "home" },
  });
  expect(state).toMatchObject({ revision: 2, updated_by: a.user.id });
  expect((await put(a.headers, [], 2)).status).toBe(200);
  expect((await home()).mode).toBe("automatic");
});

test("does not autofill partial manual choices, falls back after withdrawal, and reaches catalog fallback", async () => {
  const f = await fixture();
  const first = await selection(f, "first");
  const second = await selection(f, "second");
  const a = await admin();
  const other = await fixture();
  const automatic = await selection(other, "automatic");
  expect((await put(a.headers, [first.id, second.id], 0)).status).toBe(200);
  await storeSelection.unpublish(f.store.id, first.slug, first.draft_revision);
  const partial = await home();
  expect(partial.mode).toBe("manual");
  expect(partial.selections.map((entry) => entry.selection.id)).toEqual([
    second.id,
  ]);
  expect((await put(a.headers, [first.id], 1)).status).toBe(400);
  await storeSelection.unpublish(
    f.store.id,
    second.slug,
    second.draft_revision,
  );
  const fallback = await home();
  expect(fallback.mode).toBe("automatic");
  expect(fallback.selections.map((entry) => entry.selection.id)).toEqual([
    automatic.id,
  ]);
  await storeSelection.unpublish(
    other.store.id,
    automatic.slug,
    automatic.draft_revision,
  );
  expect((await home()).mode).toBe("catalog");
  const panel = await (
    await fetch(url("backoffice/home"), { headers: a.headers })
  ).json();
  expect(panel.items).toEqual([
    { id: first.id, entry: null },
    { id: second.id, entry: null },
  ]);
});

test("batch catalog membership matches the database predicates for all publication modes", async () => {
  const f = await fixture();
  const snapshots: StoreCatalogSnapshot[] = [];
  for (const catalog_mode of ["ALL", "SELECTED", "LEGACY_ALL"] as const) {
    for (const tag_filters of [
      [],
      [{ tag: "LIFECYCLE", mode: "WHITELIST" as const }],
      [{ tag: "lifecycle-blocked", mode: "BLACKLIST" as const }],
      [{ tag: "missing-tag-in-catalog", mode: "BLACKLIST" as const }],
      [
        { tag: "lifecycle", mode: "WHITELIST" as const },
        { tag: "lifecycle-blocked", mode: "BLACKLIST" as const },
      ],
    ]) {
      for (const game_overrides of [
        [],
        [
          { game_id: f.games[4].id, visibility: "SHOW" as const },
          { game_id: f.games[0].id, visibility: "HIDE" as const },
        ],
      ])
        snapshots.push({ catalog_mode, tag_filters, game_overrides });
    }
  }
  for (const snapshot of snapshots) {
    const knownTags = await catalogMatchTags([snapshot]);
    const actual = await prisma.game.findMany({
      where: {
        AND: [
          { id: { in: f.games.map(({ id }) => id) } },
          await getSnapshotCurationWhereClause(snapshot),
        ],
      },
      select: { id: true },
    });
    expect(
      f.games
        .filter((game) => gameMatchesCatalogSnapshot(game, snapshot, knownTags))
        .map(({ id }) => id)
        .sort(),
    ).toEqual(actual.map(({ id }) => id).sort());
  }
});

test("reapplies country pricing, display-only visibility and active status without sharing regional responses", async () => {
  const f = await fixture();
  const selected = await selection(f, "regional");
  const a = await admin();
  expect((await put(a.headers, [selected.id], 0)).status).toBe(200);
  await orchestrator.createCurrency({
    code: "BRL",
    symbol: "R$",
    enabled: true,
  });
  expect((await home()).mode).toBe("catalog");
  await prisma.game.update({
    where: { id: f.games[0].id },
    data: { status: "ONLY_DISPLAY" },
  });
  const brazil = await home();
  expect(brazil.mode).toBe("manual");
  expect(brazil.selections[0].currency).toBe("BRL");
  expect(brazil.selections[0].games.map(({ slug }) => slug)).toEqual([
    f.games[0].slug,
  ]);
  expect(brazil.selections[0].selection.game_slugs).toEqual([f.games[0].slug]);
  expect(brazil.communities[0].games.map(({ slug }) => slug)).toEqual([
    f.games[0].slug,
  ]);
  const us = await (
    await fetch(url("public/home?locale=en"), {
      headers: { "x-vercel-ip-country": "US" },
    })
  ).json();
  expect(us.selections[0].currency).toBe("USD");
  expect(us.selections[0].games).toHaveLength(3);
  await prisma.game.update({
    where: { id: f.games[0].id },
    data: { status: "INACTIVE" },
  });
  expect((await home()).mode).toBe("catalog");
});
