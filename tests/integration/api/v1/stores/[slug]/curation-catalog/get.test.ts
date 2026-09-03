import webserver from "infra/webserver";
import { prisma } from "infra/database";
import gameModel from "models/game";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/curation-catalog", () => {
  test("decorates management cards with the current draft review", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      catalog_mode: "ALL",
    });
    const reviewedGame = await orchestrator.createGame(owner.id, {
      title: "Catalog Review Surface",
    });
    const plainGame = await orchestrator.createGame(owner.id, {
      title: "Catalog Review Surface Plain",
    });
    await gameModel.makePublic(reviewedGame.id);
    await gameModel.makePublic(plainGame.id);
    await prisma.storeGameEditorial.create({
      data: {
        store_id: createdStore.id,
        game_id: reviewedGame.id,
        headline: "Catalog headline",
        body: "Draft editorial copy shown to the catalog manager.",
      },
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/curation-catalog?q=Catalog%20Review%20Surface`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.games).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reviewedGame.id,
          outlet_review: {
            headline: "Catalog headline",
            body: "Draft editorial copy shown to the catalog manager.",
          },
        }),
        expect.objectContaining({
          id: plainGame.id,
          outlet_review: null,
        }),
      ]),
    );
  });

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

  test("does not leak sales counts or rankings from another Outlet", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const managedStore = await orchestrator.createStore(owner.id, {
      name: "Managed Sales Scope",
      catalog_mode: "ALL",
    });
    const otherStore = await orchestrator.createStore(owner.id, {
      name: "Other Sales Scope",
      catalog_mode: "ALL",
    });
    const buyer = await orchestrator.createUser();

    const managedBestSeller = await orchestrator.createGame(owner.id, {
      title: "Managed Best Seller",
    });
    await gameModel.makePublic(managedBestSeller.id);
    const otherOutletBestSeller = await orchestrator.createGame(owner.id, {
      title: "Other Outlet Best Seller",
    });
    await gameModel.makePublic(otherOutletBestSeller.id);

    await prisma.sale.createMany({
      data: [
        {
          user_id: buyer.id,
          game_id: managedBestSeller.id,
          store_id: managedStore.id,
          price_at_sale: 10,
          currency: "USD",
        },
        ...Array.from({ length: 4 }, () => ({
          user_id: buyer.id,
          game_id: otherOutletBestSeller.id,
          store_id: otherStore.id,
          price_at_sale: 10,
          currency: "USD",
        })),
      ],
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${managedStore.slug}/curation-catalog?status=BEST_SELLERS&order=BEST_SELLING`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totals.best_sellers).toBe(1);
    expect(body.games).toHaveLength(1);
    expect(body.games[0]).toMatchObject({
      id: managedBestSeller.id,
      sales_count: 1,
    });
    expect(
      body.games.some(
        (game: { id: string }) => game.id === otherOutletBestSeller.id,
      ),
    ).toBe(false);
  });
});
