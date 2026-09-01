import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

const PUBLIC_STORE_FIELDS = [
  "id",
  "slug",
  "name",
  "description",
  "logo_url",
  "theme_key",
  "layout_preset",
  "tagline",
  "cover_url",
  "social_links",
  "brand_tokens",
  "owner_id",
  "publication_status",
  "published_at",
  "created_at",
  "updated_at",
].sort();

describe("GET /api/v1/public/stores", () => {
  describe("Anonymous user", () => {
    test("Returns a paginated list of all outlets, not scoped to one owner", async () => {
      const ownerA = await orchestrator.createUser();
      await orchestrator.activateUser(ownerA.id);
      const storeA = await orchestrator.createStore(ownerA.id, {
        name: "Public Directory Alpha",
      });

      const ownerB = await orchestrator.createUser();
      await orchestrator.activateUser(ownerB.id);
      const storeB = await orchestrator.createStore(ownerB.id, {
        name: "Public Directory Beta",
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/public/stores`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const slugs = responseBody.stores.map(
        (item: { slug: string }) => item.slug,
      );
      expect(slugs).toContain(storeA.slug);
      expect(slugs).toContain(storeB.slug);

      expect(responseBody.pagination).toEqual({
        page: 1,
        limit: 20,
        total: expect.any(Number),
        pages: expect.any(Number),
      });
      expect(responseBody.pagination.total).toBeGreaterThanOrEqual(2);
    });

    test("Each item exposes only the read:public_store fields", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createStore(owner.id, { name: "ShapeCheckOutlet" });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/public/stores?q=ShapeCheckOutlet`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.stores.length).toBeGreaterThanOrEqual(1);
      for (const item of responseBody.stores) {
        expect(Object.keys(item).sort()).toEqual(PUBLIC_STORE_FIELDS);
      }
    });

    test("Supports the q search filter", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const target = await orchestrator.createStore(owner.id, {
        name: "Zzyzx Unique Outlet",
      });
      await orchestrator.createStore(owner.id, { name: "Unrelated Outlet" });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/public/stores?q=Zzyzx`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      const slugs = responseBody.stores.map(
        (item: { slug: string }) => item.slug,
      );
      expect(slugs).toContain(target.slug);
      expect(
        responseBody.stores.every((item: { name: string }) =>
          item.name.toLowerCase().includes("zzyzx"),
        ),
      ).toBe(true);
    });

    test("Supports pagination via limit", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createStore(owner.id);
      await orchestrator.createStore(owner.id);

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/public/stores?limit=1`,
      );

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.stores).toHaveLength(1);
      expect(responseBody.pagination.limit).toBe(1);
      expect(responseBody.pagination.total).toBeGreaterThanOrEqual(2);
      expect(responseBody.pagination.pages).toBeGreaterThanOrEqual(2);
    });

    test("Excludes draft and unpublished Outlets", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const draft = await orchestrator.createStore(owner.id, {
        name: "Directory Private Draft",
        draft: true,
      });

      const response = await fetch(
        `${webserver.getOrigin()}/api/v1/public/stores?q=Directory%20Private%20Draft`,
      );
      expect(response.status).toBe(200);
      expect(
        (await response.json()).stores.map(
          (item: { slug: string }) => item.slug,
        ),
      ).not.toContain(draft.slug);
    });
  });
});
