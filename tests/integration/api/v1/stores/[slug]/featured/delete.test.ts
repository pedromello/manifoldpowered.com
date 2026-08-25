import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function deleteSelection(storeSlug: string, sessionToken: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/stores/${storeSlug}/featured`, {
    method: "DELETE",
    headers: { Cookie: `session_id=${sessionToken}` },
  });
}

describe("DELETE /api/v1/stores/[slug]/featured", () => {
  test("An owner can return the Outlet to automatic mode", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const game = await orchestrator.createGame(owner.id, {
      title: "Resettable Pick",
    });
    await gameModel.makePublic(game.id);

    const putResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ game_slugs: [game.slug] }),
      },
    );
    expect(putResponse.status).toBe(200);

    const deleteResponse = await deleteSelection(store.slug, session.token);
    expect(deleteResponse.status).toBe(204);

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
    );
    const publicBody = await publicResponse.json();
    expect(publicBody.mode).toBe("AUTOMATIC");
  });

  test("A member with only update:store cannot reset the selection", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id);

    const editor = await orchestrator.createUser();
    await orchestrator.activateUser(editor.id);
    const session = await orchestrator.createSession(editor.id);
    await orchestrator.addStoreMember(store.id, editor.username, [
      "update:store",
    ]);

    const response = await deleteSelection(store.slug, session.token);
    expect(response.status).toBe(403);
  });
});
