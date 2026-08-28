import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function expectPng(path: string) {
  const response = await fetch(`${webserver.getOrigin()}${path}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  expect(response.headers.get("cache-control")).toContain(
    "stale-while-revalidate",
  );

  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
  expect(bytes.byteLength).toBeGreaterThan(10_000);
}

describe("GET /api/og/[...segments]", () => {
  test("renders the institutional home preview", async () => {
    await expectPng("/api/og/home?locale=en");
  });

  test("renders an Outlet preview without a remote logo", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const outlet = await orchestrator.createStore(owner.id, {
      name: "Fallback Friends",
      description: "Games chosen with care.",
    });

    await expectPng(`/api/og/outlet/${outlet.slug}?locale=pt-BR`);
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

    await expectPng(`/api/og/game/${game.slug}?locale=en`);
  });

  test("returns 404 for an unknown preview kind", async () => {
    const response = await fetch(`${webserver.getOrigin()}/api/og/unknown`);
    expect(response.status).toBe(404);
  });
});
