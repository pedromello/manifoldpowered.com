import orchestrator from "tests/orchestrator";
import gameModel from "models/game";
import storeCuration from "models/store_curation";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function findCuratedTitles(storeId: string) {
  const curationWhere = await storeCuration.getCurationWhereClause(storeId);
  const { games } = await gameModel.findAllPaginated({
    limit: 100,
    curationWhere,
  });
  return games.map((game) => game.title);
}

describe("models/store_curation.ts curation rules", () => {
  test("With no filters or overrides configured, all active games are returned", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);

    const rpgGame = await orchestrator.createGame(owner.id, {
      title: "Baseline RPG",
      tags: ["rpg"],
    });
    await gameModel.makePublic(rpgGame.id);

    const horrorGame = await orchestrator.createGame(owner.id, {
      title: "Baseline Horror",
      tags: ["horror"],
    });
    await gameModel.makePublic(horrorGame.id);

    const titles = await findCuratedTitles(createdStore.id);
    expect(titles).toContain("Baseline Horror");
    expect(titles).toContain("Baseline RPG");
  });

  test("A blacklisted tag excludes games carrying it", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);

    const rpgGame = await orchestrator.createGame(owner.id, {
      title: "Blacklist RPG",
      tags: ["rpg"],
    });
    await gameModel.makePublic(rpgGame.id);

    const horrorGame = await orchestrator.createGame(owner.id, {
      title: "Blacklist Horror",
      tags: ["horror"],
    });
    await gameModel.makePublic(horrorGame.id);

    await orchestrator.addStoreTagFilter(
      createdStore.id,
      "horror",
      "BLACKLIST",
    );

    const titles = await findCuratedTitles(createdStore.id);
    expect(titles).toContain("Blacklist RPG");
    expect(titles).not.toContain("Blacklist Horror");
  });

  test("A whitelisted tag only includes games carrying it", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);

    const rpgGame = await orchestrator.createGame(owner.id, {
      title: "Whitelist RPG",
      tags: ["rpg"],
    });
    await gameModel.makePublic(rpgGame.id);

    const horrorGame = await orchestrator.createGame(owner.id, {
      title: "Whitelist Horror",
      tags: ["horror"],
    });
    await gameModel.makePublic(horrorGame.id);

    await orchestrator.addStoreTagFilter(createdStore.id, "rpg", "WHITELIST");

    const titles = await findCuratedTitles(createdStore.id);
    expect(titles).toContain("Whitelist RPG");
    expect(titles).not.toContain("Whitelist Horror");
  });

  test("A force-show override wins over a blacklisted tag", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);

    const bannedGame = await orchestrator.createGame(owner.id, {
      title: "Force Show Horror",
      tags: ["horror"],
    });
    await gameModel.makePublic(bannedGame.id);

    await orchestrator.addStoreTagFilter(
      createdStore.id,
      "horror",
      "BLACKLIST",
    );
    await orchestrator.addStoreGameOverride(
      createdStore.id,
      bannedGame.slug,
      "SHOW",
    );

    const titles = await findCuratedTitles(createdStore.id);
    expect(titles).toContain("Force Show Horror");
  });

  test("A force-hide override wins over a whitelisted tag", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);

    const allowedGame = await orchestrator.createGame(owner.id, {
      title: "Force Hide RPG",
      tags: ["rpg"],
    });
    await gameModel.makePublic(allowedGame.id);

    const otherAllowedGame = await orchestrator.createGame(owner.id, {
      title: "Still Visible RPG",
      tags: ["rpg"],
    });
    await gameModel.makePublic(otherAllowedGame.id);

    await orchestrator.addStoreTagFilter(createdStore.id, "rpg", "WHITELIST");
    await orchestrator.addStoreGameOverride(
      createdStore.id,
      allowedGame.slug,
      "HIDE",
    );

    const titles = await findCuratedTitles(createdStore.id);
    expect(titles).toContain("Still Visible RPG");
    expect(titles).not.toContain("Force Hide RPG");
  });
});
