import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("DELETE /api/v1/stores/[slug]/tag-filters/[tag]", () => {
  describe("Owner", () => {
    test("Should remove the tag filter and return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      await orchestrator.addStoreTagFilter(
        createdStore.id,
        "shooter",
        "BLACKLIST",
      );

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/shooter`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );

      expect(response.status).toBe(200);

      const listResponse = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters`,
        {
          headers: { Cookie: `session_id=${ownerSession.token}` },
        },
      );
      const listBody = await listResponse.json();
      expect(listBody).toHaveLength(0);
    });

    test("For a tag with no filter should return 404", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const ownerSession = await orchestrator.createSession(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/unknown-tag`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${ownerSession.token}` },
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
        "strategy",
        "WHITELIST",
      );

      const outsider = await orchestrator.createUser();
      await orchestrator.activateUser(outsider.id);
      const outsiderSession = await orchestrator.createSession(outsider.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/tag-filters/strategy`,
        {
          method: "DELETE",
          headers: { Cookie: `session_id=${outsiderSession.token}` },
        },
      );

      expect(response.status).toBe(403);
    });
  });
});
