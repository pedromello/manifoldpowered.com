import { randomUUID } from "node:crypto";
import orchestrator from "tests/orchestrator";

const BASE_URL = "http://localhost:3000/api/v1/backoffice/supplier-terms";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

async function putAs(sessionToken: string, body: unknown) {
  return await fetch(BASE_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify(body),
  });
}

async function createStudio() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  return await orchestrator.createStudio(owner.id);
}

describe("PUT /api/v1/backoffice/supplier-terms", () => {
  describe("Anonymous user", () => {
    test("should return 403 Forbidden", async () => {
      const response = await fetch(BASE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_type: "STUDIO",
          supplier_id: randomUUID(),
          cost_rate: 0.7,
        }),
      });

      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: "You do not have permission to perform this action",
        action:
          "Verify your user has the following features: update:supplier_terms:any",
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
      const studio = await createStudio();

      const response = await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 0.7,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Admin user", () => {
    test("should create terms and return 201", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      const response = await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 0.7,
      });

      expect(response.status).toBe(201);

      const responseBody = await response.json();
      expect(responseBody.supplier_type).toBe("STUDIO");
      expect(responseBody.supplier_id).toBe(studio.id);
      expect(responseBody.cost_rate).toBe("0.70000000");
    });

    // Re-agreeing a rate replaces the terms rather than adding a second row,
    // so the second write is a 200 rather than another 201.
    test("should replace existing terms and return 200", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 0.7,
      });

      const response = await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 0.65,
      });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.cost_rate).toBe("0.65000000");

      const listResponse = await fetch(BASE_URL, {
        headers: { Cookie: `session_id=${session.token}` },
      });
      const listBody = await listResponse.json();
      expect(listBody.pagination.total).toBe(1);
    });

    test("should write an audit log entry with the previous rate", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 0.7,
      });
      await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 0.6,
      });

      const auditLog = (await import("models/audit_log")).default;
      const { logs } = await auditLog.findAllPaginated({
        action: "supplier_terms:update",
      });

      expect(logs).toHaveLength(2);
      expect(logs[0].metadata).toMatchObject({
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        previous: { cost_rate: "0.70000000" },
        applied: { cost_rate: "0.60000000" },
      });
    });

    test("should return 404 when the studio does not exist", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const missingId = randomUUID();

      const response = await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: missingId,
        cost_rate: 0.7,
      });

      expect(response.status).toBe(404);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        message: `No studio was found for the supplier id "${missingId}".`,
        action: "Check the supplier id and try again.",
        name: "NotFoundError",
        status_code: 404,
      });
    });

    test("should return 400 for an unknown supplier type", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      const response = await putAs(session.token, {
        supplier_type: "WHOLESALER",
        supplier_id: studio.id,
        cost_rate: 0.7,
      });

      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toBe("One or more fields are invalid");
      expect(responseBody.action).toBe("Check the fields and try again");
      expect(responseBody.status_code).toBe(400);
    });

    test("should return 400 for a rate above 1", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      const response = await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: 1.2,
      });

      expect(response.status).toBe(400);
    });

    // Storage is 8 decimals; a rate quietly trimmed no longer reproduces the
    // cost it was used to calculate, so it is refused rather than rounded.
    test("should return 400 for a rate with more than 8 decimal places", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);
      const studio = await createStudio();

      const response = await putAs(session.token, {
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: "0.123456789",
      });

      expect(response.status).toBe(400);
    });
  });
});
