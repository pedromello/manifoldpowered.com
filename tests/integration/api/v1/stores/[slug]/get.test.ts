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
        logo_url: createdStore.logo_url,
        theme_key: createdStore.theme_key,
        layout_preset: createdStore.layout_preset,
        tagline: createdStore.tagline,
        cover_url: createdStore.cover_url,
        social_links: createdStore.social_links,
        brand_tokens: createdStore.brand_tokens,
        owner_id: owner.id,
        presentation: {
          version: 1,
          layout_preset: createdStore.layout_preset,
          tagline: null,
          cover_image_url: null,
          social_links: {},
          brand_tokens: createdStore.brand_tokens,
          theme_key: null,
        },
        status: "PUBLISHED",
        published_at: createdStore.published_at?.toISOString(),
        storefront_source: "REVISION",
        published_revision: {
          id: createdStore.published_revision_id,
          revision: 1,
          source_draft_revision: createdStore.draft_revision,
        },
        created_at: createdStore.created_at.toISOString(),
        updated_at: createdStore.published_at?.toISOString(),
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
