import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

const PUBLIC_STORE_FIELDS = [
  "id",
  "slug",
  "name",
  "description",
  "logo_url",
  "owner_id",
  "created_at",
  "updated_at",
].sort();

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/store-follows", () => {
  test("rejects an anonymous user", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows`,
    );

    expect(response.status).toBe(401);
    expect((await response.json()).name).toBe("UnauthorizedError");
  });

  test("returns an empty private list", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);

    const response = await listRequest(session.token);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stores: [] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("returns only the requester's Outlets, newest first, with public fields", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);
    const otherPlayer = await orchestrator.createUser();
    const owner = await orchestrator.createUser();
    const olderStore = await orchestrator.createStore(owner.id);
    const newerStore = await orchestrator.createStore(owner.id);
    const privateToOther = await orchestrator.createStore(owner.id);

    await prisma.storeFollow.createMany({
      data: [
        {
          user_id: player.id,
          store_id: olderStore.id,
          created_at: new Date("2026-08-24T10:00:00.000Z"),
        },
        {
          user_id: player.id,
          store_id: newerStore.id,
          created_at: new Date("2026-08-25T10:00:00.000Z"),
        },
        {
          user_id: otherPlayer.id,
          store_id: privateToOther.id,
          created_at: new Date("2026-08-26T10:00:00.000Z"),
        },
      ],
    });

    const response = await listRequest(session.token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stores.map((store: { id: string }) => store.id)).toEqual([
      newerStore.id,
      olderStore.id,
    ]);
    for (const store of body.stores) {
      expect(Object.keys(store).sort()).toEqual(PUBLIC_STORE_FIELDS);
      expect(store).not.toHaveProperty("user_id");
      expect(store).not.toHaveProperty("follow_id");
    }
  });
});

function listRequest(sessionToken: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/store-follows`, {
    headers: { Cookie: `session_id=${sessionToken}` },
  });
}
