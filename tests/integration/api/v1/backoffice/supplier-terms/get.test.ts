import orchestrator from "tests/orchestrator";

const BASE_URL = "http://localhost:3000/api/v1/backoffice/supplier-terms";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function getAs(sessionToken: string, query = "") {
  return await fetch(`${BASE_URL}${query}`, {
    headers: { Cookie: `session_id=${sessionToken}` },
  });
}

async function createStudio() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  return await orchestrator.createStudio(owner.id);
}

describe("GET /api/v1/backoffice/supplier-terms", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const response = await fetch(BASE_URL);

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: read:supplier_terms:any",
        name: "ForbiddenError",
        status_code: 403,
      });
    });
  });

  describe("Activated user without the feature", () => {
    test("should return 403 Forbidden", async () => {
      const user = await orchestrator.createUser();
      await orchestrator.activateUser(user.id);
      const session = await orchestrator.createSession(user.id);

      const response = await getAs(session.token);

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("should return an empty list with pagination", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await getAs(session.token);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.supplier_terms).toEqual([]);
      expect(responseBody.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        pages: 0,
      });
    });

    test("should return recorded terms at full scale", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      await orchestrator.setSupplierTerms({
        supplier_id: studio.id,
        cost_rate: 0.7,
      });

      const response = await getAs(session.token);
      const responseBody = await response.json();

      expect(responseBody.supplier_terms).toHaveLength(1);
      expect(responseBody.supplier_terms[0]).toEqual({
        id: expect.any(String),
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: "0.70000000",
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    test("should filter by supplier type", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      await orchestrator.setSupplierTerms({
        supplier_id: studio.id,
        cost_rate: 0.7,
      });
      await orchestrator.setSupplierTerms({
        supplier_type: "INTEGRATION",
        supplier_id: "33333333-3333-3333-3333-333333333333",
        cost_rate: 0.92,
      });

      const response = await getAs(session.token, "?supplier_type=INTEGRATION");
      const responseBody = await response.json();

      expect(responseBody.pagination.total).toBe(1);
      expect(responseBody.supplier_terms[0].cost_rate).toBe("0.92000000");
    });

    test("should return 400 for an unknown supplier type filter", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await getAs(session.token, "?supplier_type=WHOLESALER");

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("Invalid query parameters");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });
  });
});
