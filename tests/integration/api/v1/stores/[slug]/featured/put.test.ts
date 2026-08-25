import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function createPublicGame(userId: string, title: string, tags = ["rpg"]) {
  const game = await orchestrator.createGame(userId, { title, tags });
  await gameModel.makePublic(game.id);
  return game;
}

async function putSelection(
  storeSlug: string,
  sessionToken: string,
  gameSlugs: string[],
) {
  return fetch(`${webserver.getOrigin()}/api/v1/stores/${storeSlug}/featured`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify({ game_slugs: gameSlugs }),
  });
}

describe("PUT /api/v1/stores/[slug]/featured", () => {
  test("An owner can replace the selection and public GET preserves its order", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const first = await createPublicGame(owner.id, "Editorial First");
    const second = await createPublicGame(owner.id, "Editorial Second");

    const response = await putSelection(store.slug, session.token, [
      second.slug,
      first.slug,
    ]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mode: "EDITORIAL",
      game_slugs: [second.slug, first.slug],
    });

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
    );
    const publicBody = await publicResponse.json();
    expect(publicBody.mode).toBe("EDITORIAL");
    expect(publicBody.games.map((game: { slug: string }) => game.slug)).toEqual(
      [second.slug, first.slug],
    );
  });

  test("A member with only manage:store_featured_games can replace the selection", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const ownerSession = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);

    const curator = await orchestrator.createUser();
    await orchestrator.activateUser(curator.id);
    const session = await orchestrator.createSession(curator.id);
    const memberResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${ownerSession.token}`,
        },
        body: JSON.stringify({
          username: curator.username,
          permissions: ["manage:store_featured_games"],
        }),
      },
    );
    expect(memberResponse.status).toBe(201);

    const game = await createPublicGame(owner.id, "Curator Pick");
    const response = await putSelection(store.slug, session.token, [game.slug]);

    expect(response.status).toBe(200);
  });

  test("A member with only update:store cannot replace the selection", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id);

    const editor = await orchestrator.createUser();
    await orchestrator.activateUser(editor.id);
    const session = await orchestrator.createSession(editor.id);
    await orchestrator.addStoreMember(store.id, editor.username, [
      "update:store",
    ]);

    const game = await createPublicGame(owner.id, "Not Editor Pick");
    const response = await putSelection(store.slug, session.token, [game.slug]);

    expect(response.status).toBe(403);
  });

  test("A curator of another Outlet cannot replace this Outlet's selection", async () => {
    const firstOwner = await orchestrator.createUser();
    await orchestrator.activateUser(firstOwner.id);
    const targetStore = await orchestrator.createStore(firstOwner.id);

    const secondOwner = await orchestrator.createUser();
    await orchestrator.activateUser(secondOwner.id);
    const otherStore = await orchestrator.createStore(secondOwner.id);

    const curator = await orchestrator.createUser();
    await orchestrator.activateUser(curator.id);
    const session = await orchestrator.createSession(curator.id);
    await orchestrator.addStoreMember(otherStore.id, curator.username, [
      "manage:store_featured_games",
    ]);

    const game = await createPublicGame(firstOwner.id, "Wrong Outlet Pick");
    const response = await putSelection(targetStore.slug, session.token, [
      game.slug,
    ]);

    expect(response.status).toBe(403);
  });

  test("Rejects duplicate games and selections larger than three", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const games = await Promise.all(
      ["One", "Two", "Three", "Four"].map((suffix) =>
        createPublicGame(owner.id, `Validation ${suffix}`),
      ),
    );

    const duplicateResponse = await putSelection(store.slug, session.token, [
      games[0].slug,
      games[0].slug,
    ]);
    expect(duplicateResponse.status).toBe(400);

    const oversizedResponse = await putSelection(
      store.slug,
      session.token,
      games.map((game) => game.slug),
    );
    expect(oversizedResponse.status).toBe(400);
  });

  test("Rejects inactive games and games outside the Outlet curation", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);

    const inactive = await orchestrator.createGame(owner.id, {
      title: "Private Pick",
      tags: ["rpg"],
    });
    const inactiveResponse = await putSelection(store.slug, session.token, [
      inactive.slug,
    ]);
    expect(inactiveResponse.status).toBe(400);

    const excluded = await createPublicGame(owner.id, "Excluded Pick", [
      "horror",
    ]);
    await orchestrator.addStoreTagFilter(store.id, "horror", "BLACKLIST");
    const excludedResponse = await putSelection(store.slug, session.token, [
      excluded.slug,
    ]);
    expect(excludedResponse.status).toBe(400);
  });

  test("An invalid replacement leaves the previous selection intact", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const valid = await createPublicGame(owner.id, "Atomic Pick");

    expect(
      (await putSelection(store.slug, session.token, [valid.slug])).status,
    ).toBe(200);
    expect(
      (await putSelection(store.slug, session.token, ["missing-game"])).status,
    ).toBe(400);

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
    );
    const publicBody = await publicResponse.json();
    expect(publicBody.mode).toBe("EDITORIAL");
    expect(publicBody.games.map((game: { slug: string }) => game.slug)).toEqual(
      [valid.slug],
    );
  });

  test("Public GET hides a selected game that later becomes inactive without inventing an automatic recommendation", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const game = await createPublicGame(owner.id, "Unavailable Pick");

    expect(
      (await putSelection(store.slug, session.token, [game.slug])).status,
    ).toBe(200);
    await gameModel.setStatus(game.id, "PRIVATE");

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
    );
    const publicBody = await publicResponse.json();
    expect(publicBody.mode).toBe("EDITORIAL");
    expect(publicBody.games).toEqual([]);
    expect(publicBody.pagination.total).toBe(0);
  });
});
