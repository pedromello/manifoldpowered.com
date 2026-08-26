import webserver from "infra/webserver";
import storeFollow from "models/store_follow";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/store-follows/status", () => {
  test("returns false to anonymous users without exposing a count", async () => {
    const player = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);
    await storeFollow.follow(player.id, store.slug);

    const response = await statusRequest(store.slug);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ is_followed: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("returns state only for the authenticated requester", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);
    const otherPlayer = await orchestrator.createUser();
    await orchestrator.activateUser(otherPlayer.id);
    const otherSession = await orchestrator.createSession(otherPlayer.id);
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);
    await storeFollow.follow(player.id, store.slug);

    const ownResponse = await statusRequest(store.slug, session.token);
    const otherResponse = await statusRequest(store.slug, otherSession.token);

    expect(await ownResponse.json()).toEqual({ is_followed: true });
    expect(await otherResponse.json()).toEqual({ is_followed: false });
  });

  test("validates the query and returns 404 for an unknown Outlet", async () => {
    const invalidResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows/status`,
    );
    const missingResponse = await statusRequest("missing-outlet");

    expect(invalidResponse.status).toBe(400);
    expect((await invalidResponse.json()).name).toBe("ValidationError");
    expect(missingResponse.status).toBe(404);
    expect((await missingResponse.json()).name).toBe("NotFoundError");
  });
});

function statusRequest(storeSlug: string, sessionToken?: string) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/store-follows/status?store_slug=${encodeURIComponent(storeSlug)}`,
    sessionToken
      ? { headers: { Cookie: `session_id=${sessionToken}` } }
      : undefined,
  );
}
