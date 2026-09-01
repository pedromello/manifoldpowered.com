import webserver from "infra/webserver";
import gameModel from "models/game";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/curation-catalog", () => {
  test("filters, sorts, counts and paginates the catalog before returning cards", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      catalog_mode: "ALL",
    });

    for (const [title, tags] of [
      ["Scale Echo", ["Strategy"]],
      ["Scale Alpha", ["RPG", "Strategy"]],
      ["Scale Delta", ["RPG"]],
      ["Scale Bravo", ["RPG"]],
      ["Scale Charlie", ["RPG"]],
    ] as const) {
      const createdGame = await orchestrator.createGame(owner.id, {
        title,
        tags: [...tags],
      });
      await gameModel.makePublic(createdGame.id);
    }

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/curation-catalog?q=scale&tag=RPG&order=TITLE_ASC&page=2&limit=2`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.games.map((game: { title: string }) => game.title)).toEqual([
      "Scale Charlie",
      "Scale Delta",
    ]);
    expect(body.pagination).toEqual({ page: 2, limit: 2, total: 4, pages: 2 });
    expect(body.totals).toMatchObject({
      all: 5,
      in_outlet: 5,
      outside_outlet: 0,
    });
    expect(body.facets).toEqual(
      expect.arrayContaining([
        { tag: "RPG", count: 4 },
        { tag: "Strategy", count: 2 },
      ]),
    );
  });

  test("applies Selected visibility in the database-backed status filter", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    await orchestrator.addStoreTagFilter(createdStore.id, "cozy", "WHITELIST");

    const includedGame = await orchestrator.createGame(owner.id, {
      title: "Selected Cozy Scale",
      tags: ["cozy"],
    });
    await gameModel.makePublic(includedGame.id);
    const excludedGame = await orchestrator.createGame(owner.id, {
      title: "Selected Action Scale",
      tags: ["action"],
    });
    await gameModel.makePublic(excludedGame.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/curation-catalog?status=IN_OUTLET`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const titles = body.games.map((game: { title: string }) => game.title);
    expect(titles).toContain("Selected Cozy Scale");
    expect(titles).not.toContain("Selected Action Scale");
    expect(
      body.games.every((game: { in_outlet: boolean }) => game.in_outlet),
    ).toBe(true);
  });
});
