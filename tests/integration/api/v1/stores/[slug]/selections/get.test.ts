import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import storeSelection from "models/store_selection";
import {
  createReadyDraft,
  publicationRequest,
  type ReadyDraftFixture,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

let fixture: ReadyDraftFixture;
beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
  fixture = await createReadyDraft("Library");
  expect(
    (
      await publicationRequest(
        fixture.store.slug,
        fixture.sessionToken,
        "publish",
        fixture.store.draft_revision,
      )
    ).status,
  ).toBe(200);
  for (const [index, title] of ["Zebra", "Alpha", "Beta"].entries()) {
    const row = await storeSelection.create(fixture.store.id, {
      slug: title.toLowerCase(),
      title,
      description: "A public weekend selection.",
      cover_url: "https://example.com/selection.png",
      game_slugs: [fixture.games[0].slug],
      image_urls: [],
      featured_video_url: null,
    });
    const published = await storeSelection.publish(
      fixture.store.id,
      row.slug,
      fixture.user.id,
      row.draft_revision,
    );
    await prisma.storeSelection.update({
      where: { id: row.id },
      data: { published_at: new Date(`2026-10-${20 + index}T12:00:00Z`) },
    });
    if (title === "Alpha")
      await storeSelection.update(fixture.store.id, row.slug, {
        title: "Private unpublished keyword",
        description: "Secret unreleased description",
        expected_draft_revision: published.draft_revision,
      });
  }
});
afterAll(() => prisma.$disconnect());
const list = (query: string, preview = false) =>
  fetch(
    `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}/selections?${query}${preview ? "&preview=1" : ""}`,
    preview
      ? { headers: { Cookie: `session_id=${fixture.sessionToken}` } }
      : undefined,
  );

describe("Anonymous user", () => {
  test("search and title ordering use published snapshots before pagination", async () => {
    const response = await list("order=title_asc&limit=1&page=1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.selections.map((entry: { title: string }) => entry.title),
    ).toEqual(["Alpha"]);
    expect(body.pagination).toEqual({ page: 1, limit: 1, total: 3, pages: 3 });
    const filtered = await (await list("q=Alpha&limit=1")).json();
    expect(
      filtered.selections.map((entry: { title: string }) => entry.title),
    ).toEqual(["Alpha"]);
    expect(filtered.pagination.total).toBe(1);
    expect((await (await list("q=unpublished")).json()).pagination.total).toBe(
      0,
    );
    expect((await (await list("q=unreleased")).json()).pagination.total).toBe(
      0,
    );
  });
  test("publication sorting is stable and SQL wildcard characters are literal", async () => {
    expect(
      (await (await list("order=newest&limit=1")).json()).selections[0].title,
    ).toBe("Beta");
    expect(
      (await (await list("order=oldest&limit=1")).json()).selections[0].title,
    ).toBe("Zebra");
    expect((await (await list("q=%25")).json()).pagination.total).toBe(0);
    expect((await list("order=invalid")).status).toBe(400);
    expect((await list("q=" + "x".repeat(201))).status).toBe(400);
  });
  test("library is server rendered and unauthorized previews stay hidden", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/en/store/${fixture.store.slug}/selections?q=Alpha`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Alpha");
    expect(html).not.toContain("Private unpublished keyword");
    expect(html).toContain("source=selections");
    const denied = await fetch(
      `${webserver.getOrigin()}/en/store/${fixture.store.slug}/selections?preview=1`,
    );
    expect(denied.status).toBe(404);
    expect(denied.headers.get("cache-control")).toContain("private");
  });
});
describe("Authenticated owner", () => {
  test("authorized preview can search draft content and is never publicly cached", async () => {
    const response = await list("q=unpublished", true);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).selections[0].title).toBe(
      "Private unpublished keyword",
    );
  });
});
