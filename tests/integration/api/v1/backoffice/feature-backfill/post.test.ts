import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import auditLog from "models/audit_log";
import authorization from "models/authorization";
import user from "models/user";
import featureBackfill from "models/feature_backfill";
import { prisma } from "infra/database";
import { MEMBER_PERMISSIONS as STUDIO_MEMBER_PERMISSIONS } from "models/studio";
import { MEMBER_PERMISSIONS as STORE_MEMBER_PERMISSIONS } from "models/store";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function postBackfill(
  sessionToken?: string,
  body: Record<string, unknown> = {},
) {
  return fetch(`${webserver.getOrigin()}/api/v1/backoffice/feature-backfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/backoffice/feature-backfill", () => {
  test.each(["disable", "revoke", "grant"])(
    "home_admins preserves a concurrent %s instead of overwriting permissions",
    async (change) => {
      const target = await orchestrator.createAdminUser();
      const previous = target.features.filter(
        (feature) =>
          !["read:home:any", "update:home:any", "create:studio"].includes(
            feature,
          ),
      );
      await user.setFeatures(target.id, previous);
      const concurrentFeatures =
        change === "disable"
          ? authorization.DISABLED_USER_FEATURES
          : change === "revoke"
            ? authorization.ACTIVATED_USER_FEATURES
            : [...previous, "create:studio"];
      const updateMany = prisma.user.updateMany.bind(prisma.user);
      const spy = jest
        .spyOn(prisma.user, "updateMany")
        .mockImplementation((async (args) => {
          if (args.where?.id === target.id)
            await user.setFeatures(target.id, concurrentFeatures);
          return updateMany(args);
        }) as typeof updateMany);
      try {
        const report = await featureBackfill.reconcileHomeAdmins();
        expect(report.admins.skipped_ineligible).toBeGreaterThanOrEqual(1);
        expect((await orchestrator.getUserById(target.id)).features).toEqual(
          concurrentFeatures,
        );
      } finally {
        spy.mockRestore();
        // Keep this fixture from becoming a candidate in later cases.
        await user.setFeatures(target.id, authorization.DISABLED_USER_FEATURES);
      }
    },
  );

  test("home_admins adds only homepage permissions to existing active admins and is idempotent", async () => {
    const homeFeatures = ["read:home:any", "update:home:any"];
    const staleAdmin = await orchestrator.createAdminUser();
    const previous = staleAdmin.features.filter(
      (feature) =>
        !homeFeatures.includes(feature) && feature !== "create:currency:any",
    );
    await user.setFeatures(staleAdmin.id, previous);
    const ordinary = await orchestrator.createUser();
    await orchestrator.activateUser(ordinary.id);
    await orchestrator.createStudio(ordinary.id);
    await orchestrator.createStore(ordinary.id);
    const ordinaryBefore = authorization.ACTIVATED_USER_FEATURES.filter(
      (feature) => feature !== "create:studio",
    );
    await user.setFeatures(ordinary.id, ordinaryBefore);
    const disabled = await orchestrator.createAdminUser();
    await orchestrator.disableUser(disabled.id);
    const disabledBefore = (await orchestrator.getUserById(disabled.id))
      .features;
    const actor = await orchestrator.createAdminUser();
    const session = await orchestrator.createSession(actor.id);
    const response = await postBackfill(session.token, {
      scope: "home_admins",
    });
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.admins.updated).toBe(1);
    for (const pass of [
      "baseline",
      "studio_owners",
      "studio_members",
      "store_owners",
      "store_members",
    ])
      expect(report[pass]).toEqual({
        scanned: 0,
        updated: 0,
        skipped_ineligible: 0,
      });
    const updated = await orchestrator.getUserById(staleAdmin.id);
    expect([...updated.features].sort()).toEqual(
      [...previous, ...homeFeatures].sort(),
    );
    expect((await orchestrator.getUserById(ordinary.id)).features).toEqual(
      ordinaryBefore,
    );
    expect((await orchestrator.getUserById(disabled.id)).features).toEqual(
      disabledBefore,
    );
    const second = await postBackfill(session.token, { scope: "home_admins" });
    expect((await second.json()).total_unique_users_updated).toBe(0);
    expect((await orchestrator.getUserById(staleAdmin.id)).updated_at).toEqual(
      updated.updated_at,
    );
    const { logs } = await auditLog.findAllPaginated({
      action: "feature_backfill:home_admins",
      target_type: "system",
      target_id: "feature_backfill",
    });
    expect(
      logs.some(
        (log) =>
          log.admin_user_id === actor.id &&
          (log.metadata as { scope: string }).scope === "home_admins",
      ),
    ).toBe(true);
  });

  test("scoped reconciliation rejects non-admin requests and unknown scopes", async () => {
    const ordinary = await orchestrator.createUser();
    await orchestrator.activateUser(ordinary.id);
    const session = await orchestrator.createSession(ordinary.id);
    expect(
      (await postBackfill(undefined, { scope: "home_admins" })).status,
    ).toBe(403);
    expect(
      (await postBackfill(session.token, { scope: "home_admins" })).status,
    ).toBe(403);
    const actor = await orchestrator.createAdminUser();
    const actorSession = await orchestrator.createSession(actor.id);
    expect(
      (await postBackfill(actorSession.token, { scope: "unknown" })).status,
    ).toBe(400);
  });

  describe("Anonymous user", () => {
    test("Should return 403 Forbidden", async () => {
      const response = await postBackfill();
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated non-admin user", () => {
    test("Should return 403 Forbidden", async () => {
      const nonAdmin = await orchestrator.createUser();
      await orchestrator.activateUser(nonAdmin.id);
      const session = await orchestrator.createSession(nonAdmin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(403);
    });
  });

  describe("Authenticated admin user", () => {
    test("Tops up an existing admin missing a newer admin-only feature", async () => {
      const staleAdmin = await orchestrator.createAdminUser();
      // Simulate an admin granted before a newer admin feature shipped.
      await user.setFeatures(
        staleAdmin.id,
        [
          ...authorization.ACTIVATED_USER_FEATURES,
          ...authorization.ADMIN_ONLY_FEATURES,
        ].filter((feature) => feature !== "create:currency:any"),
      );

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.admins.updated).toBeGreaterThanOrEqual(1);

      const updated = await orchestrator.getUserById(staleAdmin.id);
      expect(updated.features).toEqual(
        expect.arrayContaining(authorization.ADMIN_ONLY_FEATURES),
      );
    });

    test("Never promotes a non-admin to admin", async () => {
      const plainUser = await orchestrator.createUser();
      await orchestrator.activateUser(plainUser.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      // Eligibility for the admin pass is "already holds an admin-only
      // feature", so a plain activated user must come out untouched.
      const updated = await orchestrator.getUserById(plainUser.id);
      for (const adminFeature of authorization.ADMIN_ONLY_FEATURES) {
        expect(updated.features).not.toContain(adminFeature);
      }
    });

    test("Tops up a user missing a baseline feature", async () => {
      const target = await orchestrator.createUser();
      await orchestrator.activateUser(target.id);
      // Simulate a user activated under an older baseline that's missing one
      // entry present in the *current* ACTIVATED_USER_FEATURES.
      await user.setFeatures(
        target.id,
        authorization.ACTIVATED_USER_FEATURES.filter(
          (feature) => feature !== "create:studio",
        ),
      );

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.baseline.updated).toBeGreaterThanOrEqual(1);

      const updatedTarget = await orchestrator.getUserById(target.id);
      expect(updatedTarget.features).toEqual(
        expect.arrayContaining(authorization.ACTIVATED_USER_FEATURES),
      );
    });

    test("Tops up a studio owner missing studio-scoped features", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createStudio(owner.id);
      // studio.create() already auto-grants these on creation (see
      // models/studio.ts) — strip them back out to simulate a studio created
      // before that fix shipped.
      await user.setFeatures(owner.id, authorization.ACTIVATED_USER_FEATURES);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.studio_owners.updated).toBeGreaterThanOrEqual(1);

      const updatedOwner = await orchestrator.getUserById(owner.id);
      expect(updatedOwner.features).toEqual(
        expect.arrayContaining(STUDIO_MEMBER_PERMISSIONS),
      );
    });

    test("Tops up a studio member with their own granted permission, not the full permission set", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStudio = await orchestrator.createStudio(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStudioMember(createdStudio.id, member.username, [
        "create:game",
      ]);
      // addMember() already auto-grants the given permissions on creation —
      // strip it back out to simulate a pre-fix membership row.
      await user.setFeatures(member.id, authorization.ACTIVATED_USER_FEATURES);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody.studio_members.updated).toBeGreaterThanOrEqual(1);

      const updatedMember = await orchestrator.getUserById(member.id);
      expect(updatedMember.features).toContain("create:game");
      // Proves the pass grants only this member's own permissions row, not
      // the full STUDIO_MEMBER_PERMISSIONS list — update:game is in that
      // list but was never granted to this member. (update:studio and
      // manage:studio_members aren't useful for this check: both are
      // already part of every activated user's baseline regardless of
      // studio membership.)
      expect(updatedMember.features).not.toContain("update:game");
    });

    test("Restores a store owner's baseline features (store.MEMBER_PERMISSIONS is entirely covered by ACTIVATED_USER_FEATURES today)", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createStore(owner.id);
      await user.setFeatures(
        owner.id,
        authorization.ACTIVATED_USER_FEATURES.filter(
          (feature) => !STORE_MEMBER_PERMISSIONS.includes(feature),
        ),
      );

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      // Both of store.MEMBER_PERMISSIONS (update:store, manage:store_members)
      // are also plain ACTIVATED_USER_FEATURES entries, and the baseline
      // pass runs first -- so it restores them before the store_owners pass
      // ever gets a chance to see them missing. store_owners.updated stays 0
      // here; that's correct, not a bug (it only fires today for a gap that
      // baseline doesn't already cover, which store.MEMBER_PERMISSIONS
      // doesn't have yet).
      const responseBody = await response.json();
      expect(responseBody.baseline.updated).toBeGreaterThanOrEqual(1);

      const updatedOwner = await orchestrator.getUserById(owner.id);
      expect(updatedOwner.features).toEqual(
        expect.arrayContaining(STORE_MEMBER_PERMISSIONS),
      );
    });

    test("Restores a store member's granted permission via the baseline pass", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      const createdStore = await orchestrator.createStore(owner.id);

      const member = await orchestrator.createUser();
      await orchestrator.activateUser(member.id);
      await orchestrator.addStoreMember(createdStore.id, member.username, [
        "update:store",
      ]);
      await user.setFeatures(
        member.id,
        authorization.ACTIVATED_USER_FEATURES.filter(
          (feature) => feature !== "update:store",
        ),
      );

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      // Same reasoning as the store owner test above: update:store is a
      // plain baseline feature too, so the baseline pass restores it before
      // store_members ever runs. The end state is what matters here.
      const responseBody = await response.json();
      expect(responseBody.baseline.updated).toBeGreaterThanOrEqual(1);

      const updatedMember = await orchestrator.getUserById(member.id);
      expect(updatedMember.features).toContain("update:store");
    });

    test("Does not resurrect a disabled studio owner's revoked features", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createStudio(owner.id);
      await orchestrator.disableUser(owner.id);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(
        responseBody.studio_owners.skipped_ineligible,
      ).toBeGreaterThanOrEqual(1);

      const stillDisabled = await orchestrator.getUserById(owner.id);
      expect(stillDisabled.features).toEqual(
        authorization.DISABLED_USER_FEATURES,
      );
    });

    test("Is idempotent: a second run finds nothing left to update and does not bump updated_at", async () => {
      const owner = await orchestrator.createUser();
      await orchestrator.activateUser(owner.id);
      await orchestrator.createStudio(owner.id);
      await user.setFeatures(owner.id, authorization.ACTIVATED_USER_FEATURES);

      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const firstResponse = await postBackfill(session.token);
      expect(firstResponse.status).toBe(200);
      const firstBody = await firstResponse.json();
      expect(firstBody.studio_owners.updated).toBeGreaterThanOrEqual(1);

      const afterFirstRun = await orchestrator.getUserById(owner.id);

      const secondResponse = await postBackfill(session.token);
      expect(secondResponse.status).toBe(200);
      const secondBody = await secondResponse.json();
      expect(secondBody.studio_owners.updated).toBe(0);

      const afterSecondRun = await orchestrator.getUserById(owner.id);
      expect(afterSecondRun.updated_at).toEqual(afterFirstRun.updated_at);
    });

    test("Writes an audit log entry with the report as metadata", async () => {
      const admin = await orchestrator.createAdminUser();
      const session = await orchestrator.createSession(admin.id);

      const response = await postBackfill(session.token);
      expect(response.status).toBe(200);
      const responseBody = await response.json();

      const { logs } = await auditLog.findAllPaginated({
        target_type: "system",
        target_id: "feature_backfill",
        action: "feature_backfill:run",
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].admin_user_id).toBe(admin.id);
      expect(
        (logs[0].metadata as { total_unique_users_updated: number })
          .total_unique_users_updated,
      ).toBe(responseBody.total_unique_users_updated);
    });
  });
});
