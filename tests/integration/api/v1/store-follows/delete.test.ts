import { prisma } from "infra/database";
import webserver from "infra/webserver";
import storeFollow from "models/store_follow";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/store-follows", () => {
  test("rejects an anonymous user", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_slug: "any-outlet" }),
      },
    );

    expect(response.status).toBe(401);
    expect((await response.json()).name).toBe("UnauthorizedError");
  });

  test("is idempotent and cannot delete another user's follow", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);
    const otherPlayer = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);
    await storeFollow.follow(player.id, store.slug);
    await storeFollow.follow(otherPlayer.id, store.slug);

    const firstResponse = await unfollowRequest(session.token, store.slug);
    const secondResponse = await unfollowRequest(session.token, store.slug);

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toEqual({ is_followed: false });
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual({ is_followed: false });
    expect(
      await prisma.storeFollow.findUnique({
        where: {
          user_id_store_id: {
            user_id: otherPlayer.id,
            store_id: store.id,
          },
        },
      }),
    ).not.toBeNull();
  });
});

function unfollowRequest(sessionToken: string, storeSlug: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/store-follows`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify({ store_slug: storeSlug }),
  });
}
