import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/studios", () => {
  describe("Anonymous user", () => {
    test("With valid body should return 403", async () => {
      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Some Studio" }),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        name: "ForbiddenError",
        action: "Verify your user has the following features: create:studio",
        status_code: 403,
      });
    });
  });

  describe("Authenticated user", () => {
    test("With valid body should create a studio and return 201", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          name: "Pixel Forge Studio",
          description: "Indie game developer",
          is_publisher: true,
        }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        slug: "pixel-forge-studio",
        name: "Pixel Forge Studio",
        description: "Indie game developer",
        is_publisher: true,
        owner_id: user.id,
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });
    });

    test("With is_publisher omitted should default to false", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({ name: "Default Publisher Flag Studio" }),
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody.is_publisher).toBe(false);
    });

    test("With missing name should return 400", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
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
      await orchestrator.createStudio(user1.id, {
        name: "Unique Studio Name",
      });

      const user2 = await orchestrator.createUser();
      await orchestrator.activateUser(user2.id);
      const session2 = await orchestrator.createSession(user2.id);

      const response = await fetch(`${webserver.getOrigin()}/api/v1/studios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session2.token}`,
        },
        body: JSON.stringify({ name: "Unique Studio Name" }),
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
    });
  });
});
