import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]", () => {
  describe("Anonymous user", () => {
    test("With existing slug should return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id, {
        name: "Retro Games Corner",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: createdStore.id,
        slug: createdStore.slug,
        name: createdStore.name,
        description: createdStore.description,
        owner_id: owner.id,
        created_at: createdStore.created_at.toISOString(),
        updated_at: responseBody.updated_at,
      });
    });

    test("With non-existent slug should return 404", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/stores/non-existent-store`,
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: 'Store with slug "non-existent-store" was not found.',
        name: "NotFoundError",
        action: "Check the slug and try again.",
        status_code: 404,
      });
    });
  });
});
