import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import auditLog from "models/audit_log";
import authorization from "models/authorization";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function patchDisable(id: string, body: object, sessionToken?: string) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/backoffice/users/${id}/disable`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH /api/v1/backoffice/users/[id]/disable", () => {
  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const target = await orchestrator.createUser();
      const response = await patchDisable(target.id, {});
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Disables the target user and writes an audit log entry with the previous features", async () => {
      const target = await orchestrator.createUser();
      await orchestrator.activateUser(target.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchDisable(
        target.id,
        { reason: "Repeated abuse reports" },
        session.token,
      );
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.features).toEqual(
        authorization.DISABLED_USER_FEATURES,
      );

      const { logs } = await auditLog.findAllPaginated({
        target_type: "user",
        target_id: target.id,
        action: "user:disable",
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].admin_user_id).toBe(admin.id);
      expect(logs[0].reason).toBe("Repeated abuse reports");
      expect(
        (logs[0].metadata as { previous_features: string[] }).previous_features,
      ).toEqual(authorization.ACTIVATED_USER_FEATURES);
    });

    test("An admin cannot disable their own account", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchDisable(admin.id, {}, session.token);
      expect(response.status).toBe(403);

      const responseBody = await response.json();
      expect(responseBody).toEqual({
        name: "ForbiddenError",
        message: "You cannot disable your own account.",
        action: "Ask another admin to do this for you.",
        status_code: 403,
      });
    });

    test("With an unknown id should return 404 Not Found", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await patchDisable(
        "00000000-0000-4000-8000-000000000000",
        {},
        session.token,
      );
      expect(response.status).toBe(404);
    });
  });
});
