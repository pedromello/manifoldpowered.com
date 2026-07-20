import orchestrator from "tests/orchestrator";
import auditLog from "models/audit_log";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("models/audit_log.ts", () => {
  describe(".record()", () => {
    test("creates an entry with the given fields", async () => {
      const admin = await orchestrator.createAdminUser();

      const entry = await auditLog.record({
        admin_user_id: admin.id,
        action: "game:status:update",
        target_type: "game",
        target_id: "some-game-id",
        reason: "Missing store page assets",
      });

      expect(entry.admin_user_id).toBe(admin.id);
      expect(entry.action).toBe("game:status:update");
      expect(entry.target_type).toBe("game");
      expect(entry.target_id).toBe("some-game-id");
      expect(entry.reason).toBe("Missing store page assets");
      expect(entry.created_at).toBeInstanceOf(Date);
    });

    test("`reason` is optional", async () => {
      const admin = await orchestrator.createAdminUser();

      const entry = await auditLog.record({
        admin_user_id: admin.id,
        action: "user:status:update",
        target_type: "user",
        target_id: "some-user-id",
      });

      expect(entry.reason).toBeNull();
    });

    test("stores structured `metadata`, e.g. a previous-features snapshot for user:disable", async () => {
      const admin = await orchestrator.createAdminUser();

      const entry = await auditLog.record({
        admin_user_id: admin.id,
        action: "user:disable",
        target_type: "user",
        target_id: "some-user-id",
        metadata: { previous_features: ["read:public_game", "read:session"] },
      });

      expect(entry.metadata).toEqual({
        previous_features: ["read:public_game", "read:session"],
      });
    });
  });

  describe(".findAllPaginated()", () => {
    test("returns entries newest first", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();

      const first = await auditLog.record({
        admin_user_id: admin.id,
        action: "game:status:update",
        target_type: "game",
        target_id: "game-1",
      });
      const second = await auditLog.record({
        admin_user_id: admin.id,
        action: "game:status:update",
        target_type: "game",
        target_id: "game-2",
      });

      const { logs } = await auditLog.findAllPaginated({});

      expect(logs.map((log) => log.id)).toEqual([second.id, first.id]);
    });

    test("filters by target_type and target_id", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();

      await auditLog.record({
        admin_user_id: admin.id,
        action: "game:status:update",
        target_type: "game",
        target_id: "game-1",
      });
      const userEntry = await auditLog.record({
        admin_user_id: admin.id,
        action: "user:status:update",
        target_type: "user",
        target_id: "user-1",
      });

      const { logs } = await auditLog.findAllPaginated({
        target_type: "user",
        target_id: "user-1",
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe(userEntry.id);
    });

    test("filters by action", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();

      await auditLog.record({
        admin_user_id: admin.id,
        action: "user:disable",
        target_type: "user",
        target_id: "user-1",
        metadata: { previous_features: ["read:session"] },
      });
      const enableEntry = await auditLog.record({
        admin_user_id: admin.id,
        action: "user:enable",
        target_type: "user",
        target_id: "user-1",
      });

      const { logs } = await auditLog.findAllPaginated({
        target_type: "user",
        target_id: "user-1",
        action: "user:enable",
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe(enableEntry.id);
    });

    test("filters by admin_user_id", async () => {
      await orchestrator.clearDatabaseRows();
      const firstAdmin = await orchestrator.createAdminUser();
      const secondAdmin = await orchestrator.createAdminUser();

      await auditLog.record({
        admin_user_id: firstAdmin.id,
        action: "game:status:update",
        target_type: "game",
        target_id: "game-1",
      });
      const secondAdminEntry = await auditLog.record({
        admin_user_id: secondAdmin.id,
        action: "game:status:update",
        target_type: "game",
        target_id: "game-2",
      });

      const { logs } = await auditLog.findAllPaginated({
        admin_user_id: secondAdmin.id,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe(secondAdminEntry.id);
    });

    test("paginates results", async () => {
      await orchestrator.clearDatabaseRows();
      const admin = await orchestrator.createAdminUser();

      for (let i = 0; i < 5; i++) {
        await auditLog.record({
          admin_user_id: admin.id,
          action: "game:status:update",
          target_type: "game",
          target_id: `game-${i}`,
        });
      }

      const { logs, pagination } = await auditLog.findAllPaginated({
        page: 2,
        limit: 2,
      });

      expect(logs).toHaveLength(2);
      expect(pagination).toEqual({
        page: 2,
        limit: 2,
        total: 5,
        pages: 3,
      });
    });
  });
});
