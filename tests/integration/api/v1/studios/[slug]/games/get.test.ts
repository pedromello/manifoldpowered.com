import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/studios/[slug]/games", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/games`,
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: update:studio",
        status_code: 403,
      });
    });
  });

  describe("Owner", () => {
    test("Returns the studio's own games, including non-ACTIVE ones", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      // createGame defaults to the schema's PRIVATE status, which is exactly
      // the "not yet publicly visible" case the studio owner still needs to
      // see in their own games list.
      const privateGame = await orchestrator.createGame(owner.id, {
        studio_id: createdStudio.id,
        title: "Unreleased Game",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/games`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.games).toHaveLength(1);
      expect(responseBody.games[0].id).toBe(privateGame.id);
      expect(responseBody.games[0].slug).toBe(privateGame.slug);
      expect(responseBody.games[0].status).toBe("PRIVATE");
      expect(responseBody.pagination.total).toBe(1);
    });

    test("Does not include another studio's games", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const otherOwner = await orchestrator.createUser();
      await orchestrator.activateUser(otherOwner.id);
      const otherStudio = await orchestrator.createStudio(otherOwner.id);
      await orchestrator.createGame(otherOwner.id, {
        studio_id: otherStudio.id,
        title: "Someone Else's Game",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/games`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.games).toEqual([]);
      expect(responseBody.pagination.total).toBe(0);
    });
  });

  describe("Studio member with update:studio permission", () => {
    test("Should return 200 with the studio's games", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);
      const memberGame = await orchestrator.createGame(owner.id, {
        studio_id: createdStudio.id,
      });

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      const memberSession = await orchestrator.createSession(member.id);
      await orchestrator.addStudioMember(createdStudio.id, member.username, [
        "update:studio",
      ]);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/games`,
        {
          headers: { Cookie: `session_id=${memberSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.games).toHaveLength(1);
      expect(responseBody.games[0].id).toBe(memberGame.id);
    });
  });

  describe("Unrelated activated user", () => {
    test("Targeting a studio they do not own or administer should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}/games`,
        {
          headers: { Cookie: `session_id=${outsiderSession.token}` },
        },
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to view this studio's games",
        name: "ForbiddenError",
        action: "Verify if you are an administrator of this studio",
        status_code: 403,
      });
    });
  });
});
