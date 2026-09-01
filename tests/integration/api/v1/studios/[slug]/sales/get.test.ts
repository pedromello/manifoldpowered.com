import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function getSales(slug, sessionToken, query = "") {
  return await fetch(
    `${webserver.getOrigin()}/api/v1/studios/${slug}/sales${query}`,
    sessionToken
      ? { headers: { Cookie: `session_id=${sessionToken}` } }
      : undefined,
  );
}

// A studio, one of its games, and a buyer who owns it. Returned pieces are
// everything the assertions below need to tell "mine" from "someone else's".
async function seedStudioWithSale({ storeSlug = undefined } = {}) {
  const developer = await orchestrator.createUser();
  await orchestrator.activateUser(developer.id);
  const developerSession = await orchestrator.createSession(developer.id);

  const studio = await orchestrator.createStudio(developer.id, {
    is_publisher: true,
  });
  const game = await orchestrator.createGame(developer.id, {
    studio_id: studio.id,
  });
  if (storeSlug) await gameModel.makePublic(game.id);

  const buyer = await orchestrator.createUser();
  await orchestrator.activateUser(buyer.id);
  const buyerSession = await orchestrator.createSession(buyer.id);

  const acquisition = await fetch(`${webserver.getOrigin()}/api/v1/library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${buyerSession.token}`,
    },
    body: JSON.stringify({
      slug: game.slug,
      ...(storeSlug ? { store_slug: storeSlug } : {}),
    }),
  });
  expect(acquisition.status).toBe(201);

  return { developer, developerSession, studio, game, buyer };
}

describe("GET /api/v1/studios/[slug]/sales", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const { studio } = await seedStudioWithSale();

      const response = await getSales(studio.slug);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: read:studio_sale",
        status_code: 403,
      });
    });
  });

  describe("Studio owner", () => {
    test("Should return sales of the studio's own games", async () => {
      const { developerSession, studio, game } = await seedStudioWithSale();

      const response = await getSales(studio.slug, developerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.sales).toHaveLength(1);
      expect(responseBody.sales[0].game_id).toBe(game.id);
      expect(responseBody.sales[0].game_title).toBe(game.title);
      expect(responseBody.sales[0].game_slug).toBe(game.slug);
      expect(responseBody.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        pages: 1,
      });
    });

    // The whole point of the branch: a studio is a second party, so the buyer
    // does not travel to it in any form — not the id, not the pseudonym an
    // outlet gets, not a username.
    test("Should not expose the buyer in any form", async () => {
      const { developerSession, studio, buyer } = await seedStudioWithSale();

      const response = await getSales(studio.slug, developerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const [saleOutput] = responseBody.sales;

      expect(saleOutput).not.toHaveProperty("user_id");
      expect(saleOutput).not.toHaveProperty("buyer_ref");
      expect(saleOutput).not.toHaveProperty("username");
      expect(JSON.stringify(responseBody)).not.toContain(buyer.id);
      expect(JSON.stringify(responseBody)).not.toContain(buyer.username);
    });

    test("Should record which outlet referred the sale", async () => {
      const referrer = await orchestrator.createUser();
      await orchestrator.activateUser(referrer.id);
      const outlet = await orchestrator.createStore(referrer.id);

      const { developerSession, studio } = await seedStudioWithSale({
        storeSlug: outlet.slug,
      });

      const response = await getSales(studio.slug, developerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.sales[0].store_id).toBe(outlet.id);
    });

    test("Should not return sales of another studio's games", async () => {
      const mine = await seedStudioWithSale();
      const theirs = await seedStudioWithSale();

      const response = await getSales(
        mine.studio.slug,
        mine.developerSession.token,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.sales).toHaveLength(1);
      expect(responseBody.sales[0].game_id).toBe(mine.game.id);
      expect(responseBody.sales[0].game_id).not.toBe(theirs.game.id);
    });

    // listByStudio short-circuits on an empty catalogue rather than issuing an
    // `IN ()`, so the empty page is worth pinning: it has to carry the same
    // envelope as a populated one.
    test("Should return an empty page for a studio with no games", async () => {
      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      const developerSession = await orchestrator.createSession(developer.id);
      const emptyStudio = await orchestrator.createStudio(developer.id);

      const response = await getSales(emptyStudio.slug, developerSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        sales: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      });
    });
  });

  describe("Studio member", () => {
    test("Should read the sales when granted the permission", async () => {
      const { studio, game } = await seedStudioWithSale();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "read:studio_sale",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await getSales(studio.slug, memberSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.sales).toHaveLength(1);
      expect(responseBody.sales[0].game_id).toBe(game.id);
    });

    // Refused at canRequest rather than at the resource check: a member added
    // with other permissions never holds read:studio_sale at all, so the
    // generic message is the correct one here.
    test("Should be refused without that permission", async () => {
      const { studio } = await seedStudioWithSale();

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStudioMember(studio.id, member.username, [
        "update:studio",
      ]);
      const memberSession = await orchestrator.createSession(member.id);

      const response = await getSales(studio.slug, memberSession.token);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: read:studio_sale",
        status_code: 403,
      });
    });
  });

  // canRequest only checks that the feature is held at all, and every studio
  // owner holds it. Without the resource check inside the handler, one studio
  // could read another's numbers by changing the slug.
  describe("Owner of a different studio", () => {
    test("Should return 403 Forbidden", async () => {
      const mine = await seedStudioWithSale();
      const theirs = await seedStudioWithSale();

      const response = await getSales(
        theirs.studio.slug,
        mine.developerSession.token,
      );

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ForbiddenError");
    });
  });

  describe("Admin", () => {
    test("Should read any studio's sales", async () => {
      const { studio, game } = await seedStudioWithSale();

      const admin = await orchestrator.createAdminUser();
      const adminSession = await orchestrator.createSession(admin.id);

      const response = await getSales(studio.slug, adminSession.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.sales).toHaveLength(1);
      expect(responseBody.sales[0].game_id).toBe(game.id);
    });
  });

  describe("Unknown studio slug", () => {
    test("Should return 404 Not Found", async () => {
      const developer = await orchestrator.createUser();
      await orchestrator.activateUser(developer.id);
      await orchestrator.createStudio(developer.id);
      const developerSession = await orchestrator.createSession(developer.id);

      const response = await getSales("does-not-exist", developerSession.token);

      expect(response.status).toBe(404);
    });
  });

  describe("Invalid query parameters", () => {
    test("Should return 400 Bad Request", async () => {
      const { developerSession, studio } = await seedStudioWithSale();

      const response = await getSales(
        studio.slug,
        developerSession.token,
        "?page=0",
      );

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid query parameters");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
