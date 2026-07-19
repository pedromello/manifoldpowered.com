import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/studios/[slug]", () => {
  describe("Anonymous user", () => {
    test("With existing slug should return 200", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id, {
        name: "Retro Games Studio",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/${createdStudio.slug}`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        id: createdStudio.id,
        slug: createdStudio.slug,
        name: createdStudio.name,
        description: createdStudio.description,
        is_publisher: createdStudio.is_publisher,
        owner_id: owner.id,
        created_at: createdStudio.created_at.toISOString(),
        updated_at: responseBody.updated_at,
      });
    });

    test("With non-existent slug should return 404", async () => {
      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/studios/non-existent-studio`,
      );

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: 'Studio with slug "non-existent-studio" was not found.',
        name: "NotFoundError",
        action: "Check the slug and try again.",
        status_code: 404,
      });
    });
  });
});
