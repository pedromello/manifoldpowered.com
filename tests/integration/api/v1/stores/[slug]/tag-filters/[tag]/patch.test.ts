import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/stores/[slug]/tag-filters/[tag]", () => {
  describe("Owner", () => {
    test("With valid mode should update the tag filter and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      await orchestrator.addStoreTagFilter(createdStore.id, "rpg", "WHITELIST");

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/rpg`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ mode: "BLACKLIST" }),
        },
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: responseBody.id,
        store_id: createdStore.id,
        tag: "rpg",
        mode: "BLACKLIST",
        created_at: responseBody.created_at,
        updated_at: responseBody.updated_at,
      });
    });

    test("For a tag with no filter should return 404", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/unknown-tag`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${ownerSession.token}`,
          },
          body: JSON.stringify({ mode: "BLACKLIST" }),
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Unrelated activated user", () => {
    test("Should return 403", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);
      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "puzzle",
        "WHITELIST",
      );

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/puzzle`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `session_id=${outsiderSession.token}`,
          },
          body: JSON.stringify({ mode: "BLACKLIST" }),
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
