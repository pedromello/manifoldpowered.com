import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/store-follows", () => {
  test("rejects an anonymous user", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_slug: "any-outlet" }),
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Authentication required",
      name: "UnauthorizedError",
      action: "Sign in and send the session_id cookie",
      status_code: 401,
    });
  });

  test("allows an activated player with no Outlet permissions to follow", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);

    const response = await followRequest(session.token, store.slug);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ is_followed: true });
    expect(
      await prisma.storeFollow.count({
        where: { user_id: player.id, store_id: store.id },
      }),
    ).toBe(1);
  });

  test("is idempotent under concurrent requests", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);
    const owner = await orchestrator.createUser();
    const store = await orchestrator.createStore(owner.id);

    const responses = await Promise.all([
      followRequest(session.token, store.slug),
      followRequest(session.token, store.slug),
      followRequest(session.token, store.slug),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201,
    ]);
    expect(
      await prisma.storeFollow.count({
        where: { user_id: player.id, store_id: store.id },
      }),
    ).toBe(1);
  });

  test("rejects unactivated users through authorization", async () => {
    const player = await orchestrator.createUser();
    const session = await orchestrator.createSession(player.id);

    const response = await followRequest(session.token, "any-outlet");

    expect(response.status).toBe(403);
    expect((await response.json()).action).toBe(
      "Verify your user has the following features: create:store_follow",
    );
  });

  test("rejects invalid input and extra fields", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/store-follows`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ store_slug: "", user_id: "another-user" }),
      },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.name).toBe("ValidationError");
    expect(body.message).toBe("One or more fields are invalid");
    expect(body.status_code).toBe(400);
  });

  test("returns 404 for an unknown Outlet", async () => {
    const player = await orchestrator.createUser();
    await orchestrator.activateUser(player.id);
    const session = await orchestrator.createSession(player.id);

    const response = await followRequest(session.token, "missing-outlet");

    expect(response.status).toBe(404);
    expect((await response.json()).name).toBe("NotFoundError");
  });
});

function followRequest(sessionToken: string, storeSlug: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/store-follows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify({ store_slug: storeSlug }),
  });
}
