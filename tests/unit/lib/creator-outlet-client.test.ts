import { type CreatorGameSummary } from "lib/creator-lifecycle";
import {
  fetchOutletPublication,
  saveExplicitOutletSelection,
  updateOutletPublication,
} from "lib/creator-outlet-client";

const games: CreatorGameSummary[] = Array.from({ length: 5 }, (_, index) => ({
  id: `game-${index + 1}`,
  slug: `game-${index + 1}`,
  title: `Game ${index + 1}`,
  bannerUrl: null,
}));

describe("creator Outlet client", () => {
  test("reads and publishes through the Sprint 0 publication endpoint", async () => {
    const request = mockFetch((url, init) => {
      expect(url).toBe("/api/v1/stores/save-point/publication");
      if (init?.method === "POST") {
        expect(init.body).toBe(JSON.stringify({ action: "publish" }));
        return publicationResponse("PUBLISHED");
      }
      return publicationResponse("DRAFT");
    });

    await expect(
      fetchOutletPublication("save-point", request),
    ).resolves.toMatchObject({
      status: "DRAFT",
    });
    await expect(
      updateOutletPublication("save-point", "publish", request),
    ).resolves.toMatchObject({ status: "PUBLISHED" });
  });

  test("persists a focused strategy as an explicit include rule", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = mockFetch((url, init) => {
      calls.push({ url, init });
      return jsonResponse({});
    });

    await saveExplicitOutletSelection(
      "save-point",
      { strategy: "FOCUSED", tags: ["Strategy"], gameSlugs: [] },
      request,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "/api/v1/stores/save-point/selection",
      init: { method: "PUT" },
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      strategy: "FOCUSED",
      tags: ["Strategy"],
      game_slugs: [],
    });
  });

  test("narrows a handpicked shelf before adding five explicit games", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const request = mockFetch((url, init) => {
      calls.push({ url, init });
      return jsonResponse({});
    });

    await saveExplicitOutletSelection(
      "save-point",
      {
        strategy: "HANDPICKED",
        tags: [],
        gameSlugs: games.map((game) => game.slug),
      },
      request,
    );

    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      strategy: "HANDPICKED",
      tags: [],
      game_slugs: games.map((game) => game.slug),
    });
  });
});

function publicationResponse(status: "DRAFT" | "PUBLISHED") {
  return jsonResponse({
    status,
    published_at: status === "PUBLISHED" ? "2026-09-01T12:00:00.000Z" : null,
    readiness: {
      version: 1,
      ready: true,
      checks: {
        brand_complete: true,
        catalog_curated: true,
        catalog_has_games: true,
        editorial_highlight: true,
      },
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}
