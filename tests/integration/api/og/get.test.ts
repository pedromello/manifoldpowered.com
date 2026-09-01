import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import {
  createReadyDraft,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function expectPng(
  path: string,
  expectedCache: "public" | "no-store" = "public",
  init?: RequestInit,
) {
  const response = await fetch(`${webserver.getOrigin()}${path}`, init);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  expect(response.headers.get("cache-control")).toContain(expectedCache);

  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
  expect(bytes.byteLength).toBeGreaterThan(10_000);

  return { response, bytes };
}

async function publishOutlet(label: string) {
  const fixture = await createReadyDraft(label);
  const response = await publicationRequest(
    fixture.store.slug,
    fixture.sessionToken,
    "publish",
    fixture.store.draft_revision,
  );
  expect(response.status).toBe(200);

  return { fixture, published: await response.json() };
}

describe("GET /api/og/[...segments]", () => {
  test("renders the institutional home preview", async () => {
    await expectPng("/api/og/home?locale=en", "public");
  });

  test("renders an Outlet preview without a remote logo", async () => {
    const { fixture, published } = await publishOutlet("Fallback Friends");
    const outlet = fixture.store;

    const unversioned = await expectPng(
      `/api/og/outlet/${outlet.slug}?locale=pt-BR`,
    );
    expect(unversioned.response.headers.get("etag")).toBeTruthy();
    expect(unversioned.response.headers.get("last-modified")).toBe(
      new Date(published.published_at).toUTCString(),
    );
    expect(unversioned.response.headers.get("cache-control")).not.toContain(
      "immutable",
    );

    const versioned = await expectPng(
      `/api/og/outlet/${outlet.slug}?locale=pt-BR&v=${encodeURIComponent(
        published.published_at,
      )}`,
    );
    expect(versioned.response.headers.get("cache-control")).toContain(
      "immutable",
    );
  });

  test("does not expose an unpublished Outlet, even when preview is requested", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const outlet = await orchestrator.createStore(owner.id, {
      name: "Secret Draft Outlet",
    });
    const session = await orchestrator.createSession(owner.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/og/outlet/${outlet.slug}?preview=1`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(404);
  });

  test("keeps published OG content stable after a private draft edit", async () => {
    const { fixture } = await publishOutlet("Visible Published Identity");
    const outlet = fixture.store;
    const before = await expectPng(`/api/og/outlet/${outlet.slug}?locale=en`);

    const patchResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${fixture.sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Unpublished Secret Identity",
          description: "Draft copy must never reach crawlers.",
        }),
      },
    );
    expect(patchResponse.status).toBe(200);

    const after = await expectPng(
      `/api/og/outlet/${outlet.slug}?locale=en&preview=1`,
      "public",
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );
    expect(after.response.headers.get("etag")).toBe(
      before.response.headers.get("etag"),
    );
    expect(after.bytes).toEqual(before.bytes);
  });

  test("revalidates a published revision with its ETag", async () => {
    const { fixture } = await publishOutlet("Conditional Preview");
    const outlet = fixture.store;
    const initial = await expectPng(`/api/og/outlet/${outlet.slug}?locale=en`);
    const etag = initial.response.headers.get("etag");
    expect(etag).toBeTruthy();

    const response = await fetch(
      `${webserver.getOrigin()}/api/og/outlet/${outlet.slug}?locale=en`,
      { headers: { "If-None-Match": etag! } },
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(etag);
  });

  test("renders a game preview without remote artwork", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const game = await orchestrator.createGame(owner.id, {
      title: "No Art Needed",
      description: "A deterministic fallback preview.",
      price: 0,
      media: { screenshots: [], videos: [] },
    });

    await expectPng(`/api/og/game/${game.slug}?locale=en`, "public");
  });

  test("returns 404 for an unknown preview kind", async () => {
    const response = await fetch(`${webserver.getOrigin()}/api/og/unknown`);
    expect(response.status).toBe(404);
  });

  test("returns 404 when extra path segments are appended", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/og/home/unexpected`,
    );
    expect(response.status).toBe(404);
  });
});
