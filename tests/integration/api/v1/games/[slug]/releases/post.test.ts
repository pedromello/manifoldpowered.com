import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/games/[slug]/releases", () => {
  describe("Anonymous user", () => {
    test("requires the existing session cookie", async () => {
      const response = await requestRelease("missing-game", {
        version: "1.0.0",
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        name: "UnauthorizedError",
        message: "Authentication required",
        action: "Sign in and send the session_id cookie",
        status_code: 401,
      });
    });

    test("does not accept a valid session token as bearer authentication", async () => {
      const user = await activatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/games/missing-game/releases`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ version: "1.0.0" }),
        },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        name: "UnauthorizedError",
        message: "Authentication required",
        action: "Sign in and send the session_id cookie",
        status_code: 401,
      });
    });
  });

  describe("Authenticated user", () => {
    test("allows the studio owner to create a filtered draft release", async () => {
      const owner = await activatedUser();
      const game = await orchestrator.createGame(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await requestRelease(
        game.slug,
        {
          version: "1.0.0",
          release_notes: "First Windows release",
        },
        session.token,
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toEqual({
        id: expect.any(String),
        game_id: game.id,
        version: "1.0.0",
        release_number: 1,
        status: "DRAFT",
        release_notes: "First Windows release",
        published_at: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
      expect(body).not.toHaveProperty("artifacts");
    });

    test("assigns monotonically increasing release numbers", async () => {
      const owner = await activatedUser();
      const game = await orchestrator.createGame(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const [first, second] = await Promise.all([
        requestRelease(game.slug, { version: "1.0.0" }, session.token),
        requestRelease(game.slug, { version: "1.1.0" }, session.token),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const releases = [await first.json(), await second.json()];
      expect(new Set(releases.map((release) => release.id)).size).toBe(2);
      expect(
        releases
          .map((release) => release.release_number)
          .sort((left, right) => left - right),
      ).toEqual([1, 2]);
    });

    test("allows a studio member with release creation permission", async () => {
      const owner = await activatedUser();
      const studio = await orchestrator.createStudio(owner.id);
      const game = await orchestrator.createGame(owner.id, {
        studio_id: studio.id,
      });
      const member = await activatedUser();
      await orchestrator.addStudioMember(studio.id, member.username, [
        "create:game_release",
      ]);
      const session = await orchestrator.createSession(member.id);

      const response = await requestRelease(
        game.slug,
        { version: "2.0.0" },
        session.token,
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        id: expect.any(String),
        game_id: game.id,
        version: "2.0.0",
        release_number: 1,
        status: "DRAFT",
        release_notes: null,
        published_at: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    test("rejects a studio member without release creation permission", async () => {
      const owner = await activatedUser();
      const studio = await orchestrator.createStudio(owner.id);
      const game = await orchestrator.createGame(owner.id, {
        studio_id: studio.id,
      });
      const member = await activatedUser();
      await orchestrator.addStudioMember(studio.id, member.username, [
        "update:game",
      ]);
      await orchestrator.addFeaturesToUser(member.id, ["create:game_release"]);
      const session = await orchestrator.createSession(member.id);

      const response = await requestRelease(
        game.slug,
        { version: "1.0.0" },
        session.token,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        name: "ForbiddenError",
        message: "You are not allowed to create releases for this game",
        action: "Use a studio owner or member with release creation permission",
        status_code: 403,
      });
      await expect(
        prisma.gameRelease.count({ where: { game_id: game.id } }),
      ).resolves.toBe(0);
    });

    test("rejects a user who holds the feature but does not control the game", async () => {
      const owner = await activatedUser();
      const game = await orchestrator.createGame(owner.id);
      const attacker = await activatedUser();
      await orchestrator.addFeaturesToUser(attacker.id, [
        "create:game_release",
      ]);
      const session = await orchestrator.createSession(attacker.id);

      const response = await requestRelease(
        game.slug,
        { version: "1.0.0" },
        session.token,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        name: "ForbiddenError",
        message: "You are not allowed to create releases for this game",
        action: "Use a studio owner or member with release creation permission",
        status_code: 403,
      });
    });

    test("returns 404 when the game does not exist", async () => {
      const owner = await activatedUser();
      await orchestrator.createStudio(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await requestRelease(
        "missing-game",
        { version: "1.0.0" },
        session.token,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        name: "NotFoundError",
        message: 'Game "missing-game" was not found.',
        action: "Check the game slug and try again.",
        status_code: 404,
      });
    });

    test("rejects invalid release fields", async () => {
      const owner = await activatedUser();
      const game = await orchestrator.createGame(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await requestRelease(
        game.slug,
        { version: " ", release_notes: "a".repeat(100_001) },
        session.token,
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.name).toBe("ValidationError");
      expect(body.message).toBe("Invalid game release declaration");
      expect(body.action).toBe("Check the version and release notes");
      expect(body.status_code).toBe(400);
      expect(body.context).toHaveLength(2);
      expect(body.context[0].path).toEqual(["version"]);
      expect(body.context[1].path).toEqual(["release_notes"]);
    });

    test("rejects server-controlled release fields", async () => {
      const owner = await activatedUser();
      const game = await orchestrator.createGame(owner.id);
      const session = await orchestrator.createSession(owner.id);

      const response = await requestRelease(
        game.slug,
        {
          version: "1.0.0",
          game_id: "11111111-1111-4111-8111-111111111111",
          status: "PUBLISHED",
          release_number: 999,
        },
        session.token,
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.name).toBe("ValidationError");
      expect(body.message).toBe("Invalid game release declaration");
      expect(body.context).toHaveLength(1);
      expect(body.context[0].code).toBe("unrecognized_keys");
      expect(body.context[0].keys).toEqual([
        "game_id",
        "status",
        "release_number",
      ]);
    });
  });
});

async function activatedUser() {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  return user;
}

function requestRelease(
  slug: string,
  body: Record<string, unknown>,
  sessionToken?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionToken) headers.Cookie = `session_id=${sessionToken}`;

  return fetch(`${webserver.getOrigin()}/api/v1/games/${slug}/releases`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
