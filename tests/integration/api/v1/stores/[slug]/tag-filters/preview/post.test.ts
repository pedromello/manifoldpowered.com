import gameModel from "models/game";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/stores/[slug]/tag-filters/preview", () => {
  test("shows exact impact without mutating the rule", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });

    const rpg = await orchestrator.createGame(owner.id, {
      title: "Preview Rule RPG",
      tags: ["RPG"],
    });
    const horror = await orchestrator.createGame(owner.id, {
      title: "Preview Rule Horror",
      tags: ["Horror"],
    });
    await gameModel.makePublic(rpg.id);
    await gameModel.makePublic(horror.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          action: "UPSERT",
          tag: "rpg",
          mode: "WHITELIST",
          expected_draft_revision: 1,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      draft_revision: 1,
      current_count: 0,
      result_count: 1,
      shown_count: 1,
      hidden_count: 0,
      unchanged_count: 0,
    });

    const filtersResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters`,
      { headers: { Cookie: `session_id=${session.token}` } },
    );
    expect(await filtersResponse.json()).toEqual([]);
  });

  test("previews removing an existing rule and preserves override precedence", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);

    const rpg = await orchestrator.createGame(owner.id, {
      title: "Remove Preview RPG",
      tags: ["RPG"],
    });
    const horror = await orchestrator.createGame(owner.id, {
      title: "Remove Preview Horror",
      tags: ["Horror"],
    });
    await gameModel.makePublic(rpg.id);
    await gameModel.makePublic(horror.id);
    await orchestrator.addStoreTagFilter(
      createdStore.id,
      "horror",
      "BLACKLIST",
    );
    await orchestrator.addStoreGameOverride(
      createdStore.id,
      horror.slug,
      "SHOW",
    );

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          action: "REMOVE",
          tag: "horror",
          expected_draft_revision: 3,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      draft_revision: 3,
      current_count: 3,
      result_count: 4,
      shown_count: 1,
      hidden_count: 0,
      unchanged_count: 3,
    });
  });

  test("rejects an unrelated user", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id);
    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    const outsiderSession = await orchestrator.createSession(outsider.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${outsiderSession.token}`,
        },
        body: JSON.stringify({
          action: "UPSERT",
          tag: "rpg",
          mode: "WHITELIST",
          expected_draft_revision: 1,
        }),
      },
    );

    expect(response.status).toBe(403);
  });
});
