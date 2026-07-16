import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/search", () => {
  describe("Anonymous user", () => {
    test("For an unknown store should return 404", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/does-not-exist/search`,
      );

      expect(response.status).toBe(404);
    });

    test("With no curation rules should return every active game", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const rpgGame = await orchestrator.createGame(owner.id, {
        title: "Search RPG",
        tags: ["rpg"],
      });
      await gameModel.makePublic(rpgGame.id);

      const horrorGame = await orchestrator.createGame(owner.id, {
        title: "Search Horror",
        tags: ["horror"],
      });
      await gameModel.makePublic(horrorGame.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/search`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Search RPG");
      expect(titles).toContain("Search Horror");
    });

    test("A blacklisted tag excludes matching games from the results", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const allowedGame = await orchestrator.createGame(owner.id, {
        title: "Blacklist Search Allowed",
        tags: ["rpg"],
      });
      await gameModel.makePublic(allowedGame.id);

      const bannedGame = await orchestrator.createGame(owner.id, {
        title: "Blacklist Search Banned",
        tags: ["horror"],
      });
      await gameModel.makePublic(bannedGame.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "horror",
        "BLACKLIST",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/search`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Blacklist Search Allowed");
      expect(titles).not.toContain("Blacklist Search Banned");
    });

    test("A whitelisted tag only includes matching games in the results", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const rpgGame = await orchestrator.createGame(owner.id, {
        title: "Whitelist Search RPG",
        tags: ["rpg"],
      });
      await gameModel.makePublic(rpgGame.id);

      const horrorGame = await orchestrator.createGame(owner.id, {
        title: "Whitelist Search Horror",
        tags: ["horror"],
      });
      await gameModel.makePublic(horrorGame.id);

      await orchestrator.addStoreTagFilter(createdStore.id, "rpg", "WHITELIST");

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/search`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Whitelist Search RPG");
      expect(titles).not.toContain("Whitelist Search Horror");
    });

    test("A force-show override always includes the game, even with a blacklisted tag", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const bannedButForced = await orchestrator.createGame(owner.id, {
        title: "Force Show Search Horror",
        tags: ["horror"],
      });
      await gameModel.makePublic(bannedButForced.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "horror",
        "BLACKLIST",
      );
      await orchestrator.addStoreGameOverride(
        createdStore.id,
        bannedButForced.slug,
        "SHOW",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/search`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Force Show Search Horror");
    });

    test("A force-hide override always excludes the game, even with a whitelisted tag", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const allowedButHidden = await orchestrator.createGame(owner.id, {
        title: "Force Hide Search RPG",
        tags: ["rpg"],
      });
      await gameModel.makePublic(allowedButHidden.id);

      const stillVisible = await orchestrator.createGame(owner.id, {
        title: "Still Visible Search RPG",
        tags: ["rpg"],
      });
      await gameModel.makePublic(stillVisible.id);

      await orchestrator.addStoreTagFilter(createdStore.id, "rpg", "WHITELIST");
      await orchestrator.addStoreGameOverride(
        createdStore.id,
        allowedButHidden.slug,
        "HIDE",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/search`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Still Visible Search RPG");
      expect(titles).not.toContain("Force Hide Search RPG");
    });

    test("Should combine curation with the q search parameter", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const matchingGame = await orchestrator.createGame(owner.id, {
        title: "Combined Query Dragon Quest",
        tags: ["rpg"],
      });
      await gameModel.makePublic(matchingGame.id);

      const bannedMatchingGame = await orchestrator.createGame(owner.id, {
        title: "Combined Query Dragon Horror",
        tags: ["horror"],
      });
      await gameModel.makePublic(bannedMatchingGame.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "horror",
        "BLACKLIST",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/search?q=dragon`,
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = body.games.map((g: { title: string }) => g.title);
      expect(titles).toContain("Combined Query Dragon Quest");
      expect(titles).not.toContain("Combined Query Dragon Horror");
    });
  });
});
