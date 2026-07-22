import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/stores", () => {
  describe("Anonymous user", () => {
    test("With valid body should return 403", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Some Store" }),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:store",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With valid body should create a store and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          name: "Pixel Arcade",
          description: "Curated indie games",
        }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        slug: "pixel-arcade",
        name: "Pixel Arcade",
        description: "Curated indie games",
        logo_url: null,
        owner_id: user.id,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });
    });

    test("With a logo_url should persist and return it", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          name: "Logo Store",
          logo_url: "https://example.com/logo.png",
        }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody.logo_url).toBe("https://example.com/logo.png");
    });

    test("With missing name should return 400", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });

    test("With duplicate name should return 400", async () => {
      const user1 = await orchestrator.createUser();
      await orchestrator.activateUser(user1.id);
      await orchestrator.createStore(user1.id, { name: "Unique Store Name" });

      const user2 = await orchestrator.createUser();
      await orchestrator.activateUser(user2.id);
      const session2 = await orchestrator.createSession(user2.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/stores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session2.token}`,
        },
        body: JSON.stringify({ name: "Unique Store Name" }),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });
  });
});
