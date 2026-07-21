import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import auditLog from "models/audit_log";
import authorization from "models/authorization";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function patchEnable(id: string, sessionToken?: string) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/users/${id}/enable`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
      },
    },
  );
}

// Goes through the real disable route (not the model function directly) so
// its audit log write actually happens - enable's restore depends on it.
async function patchDisable(
  id: string,
  adminSessionToken: string,
): Promise<Response> {
  return fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/users/${id}/disable`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${adminSessionToken}`,
      },
      body: JSON.stringify({}),
    },
  );
}

describe("PATCH /api/v1/backoffice/users/[id]/enable", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const target = await orchestrator.createUser();
      const response = await patchEnable(target.id);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Restores the exact features the user had before being disabled", async () => {
      const target = await orchestrator.createUser();
      await orchestrator.activateUser(target.id);
      await orchestrator.addFeaturesToUser(target.id, ["read:status:all"]);
      const featuresBeforeDisable = (await orchestrator.getUserById(target.id))
        .features;

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      await patchDisable(target.id, session.token);

      const response = await patchEnable(target.id, session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.features).toEqual(featuresBeforeDisable);

      const { logs } = await auditLog.findAllPaginated({
        target_type: "user",
        target_id: target.id,
        action: "user:enable",
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].admin_user_id).toBe(admin.id);
    });

    test("A disabled admin fully regains their admin features on re-enable", async () => {
      const admin = await orchestrator.createAdminUser();
      const otherAdmin = await orchestrator.createAdminUser();
      const featuresBeforeDisable = admin.features;
      const otherAdminSession = await orchestrator.createSession(otherAdmin.id);

      await patchDisable(admin.id, otherAdminSession.token);

      const response = await patchEnable(admin.id, otherAdminSession.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.features).toEqual(
        expect.arrayContaining(authorization.ADMIN_ONLY_FEATURES),
      );
      expect(responseBody.features).toEqual(featuresBeforeDisable);
    });

    test("Enabling a user who isn't disabled returns 400", async () => {
      const target = await orchestrator.createUser();
      await orchestrator.activateUser(target.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchEnable(target.id, session.token);
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ValidationError",
        message: "User is not currently disabled.",
        action: "Only disabled users can be enabled.",
        status_code: 400,
      });
    });

    test("With an unknown id should return 404 Not Found", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchEnable(
        "00000000-0000-4000-8000-000000000000",
        session.token,
      );
      expect(response.status).toBe(404);
    });
  });
});
