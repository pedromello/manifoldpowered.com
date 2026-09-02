import orchestrator from "tests/orchestrator";
import authorization from "models/authorization";
import user from "models/user";
import featureBackfill from "models/feature_backfill";
import { MEMBER_PERMISSIONS as STUDIO_MEMBER_PERMISSIONS } from "models/studio";
import {
  MEMBER_PERMISSIONS as STORE_MEMBER_PERMISSIONS,
  STORE_OWNER_FEATURES,
} from "models/store";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("models/feature_backfill.ts reconcileAll()", () => {
  test("Tops up an activated user missing a baseline feature", async () => {
    const target = await orchestrator.createUser();
    await orchestrator.activateUser(target.id);
    await user.setFeatures(
      target.id,
      authorization.ACTIVATED_USER_FEATURES.filter(
        (feature) => feature !== "create:studio",
      ),
    );

    const report = await featureBackfill.reconcileAll();
    expect(report.baseline.updated).toBeGreaterThanOrEqual(1);

    const updatedTarget = await orchestrator.getUserById(target.id);
    expect(updatedTarget.features).toEqual(
      expect.arrayContaining(authorization.ACTIVATED_USER_FEATURES),
    );
  });

  test("Never grants features to a user with no update:user marker (unactivated)", async () => {
    const unactivated = await orchestrator.createUser();

    await featureBackfill.reconcileAll();

    const stillUnactivated = await orchestrator.getUserById(unactivated.id);
    expect(stillUnactivated.features).toEqual(["read:activation_token"]);
  });

  test("Tops up a studio owner and does not resurrect a disabled owner", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    await orchestrator.createStudio(owner.id);
    await user.setFeatures(owner.id, authorization.ACTIVATED_USER_FEATURES);

    const disabledOwner = await orchestrator.createUser();
    await orchestrator.activateUser(disabledOwner.id);
    await orchestrator.createStudio(disabledOwner.id);
    await orchestrator.disableUser(disabledOwner.id);

    const report = await featureBackfill.reconcileAll();

    const updatedOwner = await orchestrator.getUserById(owner.id);
    expect(updatedOwner.features).toEqual(
      expect.arrayContaining(STUDIO_MEMBER_PERMISSIONS),
    );

    const stillDisabled = await orchestrator.getUserById(disabledOwner.id);
    expect(stillDisabled.features).toEqual(
      authorization.DISABLED_USER_FEATURES,
    );
    expect(report.studio_owners.skipped_ineligible).toBeGreaterThanOrEqual(1);
  });

  test("Tops up an existing store owner with editorial curation without granting it to unrelated users", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    await orchestrator.createStore(owner.id);
    await user.setFeatures(owner.id, authorization.ACTIVATED_USER_FEATURES);

    const unrelated = await orchestrator.createUser();
    await orchestrator.activateUser(unrelated.id);

    const report = await featureBackfill.reconcileAll();
    expect(report.store_owners.updated).toBeGreaterThanOrEqual(1);

    const updatedOwner = await orchestrator.getUserById(owner.id);
    expect(updatedOwner.features).toContain("manage:store_featured_games");
    expect(updatedOwner.features).toEqual(
      expect.arrayContaining(STORE_OWNER_FEATURES),
    );

    const unchangedUnrelated = await orchestrator.getUserById(unrelated.id);
    expect(unchangedUnrelated.features).not.toContain(
      "manage:store_featured_games",
    );
  });

  // The admin pass decides who is an admin by asking whether they already hold
  // any ADMIN_ONLY_FEATURES entry, which is only sound while every entry in
  // that list is admin-exclusive. Putting a feature there that a studio or
  // outlet member can also hold — read:studio_sale is the obvious candidate,
  // since it needs an :any escape hatch — would promote every one of them to
  // full admin on the next reconcile. This asserts the list stays exclusive.
  test("ADMIN_ONLY_FEATURES shares nothing with the member permission sets", () => {
    const memberPermissions = [
      ...STUDIO_MEMBER_PERMISSIONS,
      ...STORE_MEMBER_PERMISSIONS,
    ];

    const overlap = authorization.ADMIN_ONLY_FEATURES.filter((feature) =>
      memberPermissions.includes(feature),
    );

    expect(overlap).toEqual([]);
  });

  test("ADMIN_ONLY_FEATURES shares nothing with the activated user set", () => {
    const overlap = authorization.ADMIN_ONLY_FEATURES.filter((feature) =>
      authorization.ACTIVATED_USER_FEATURES.includes(feature),
    );

    expect(overlap).toEqual([]);
  });

  test("Does not promote a studio owner to admin", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    await orchestrator.createStudio(owner.id);

    await featureBackfill.reconcileAll();
    await featureBackfill.reconcileAll();

    const afterBackfill = await orchestrator.getUserById(owner.id);
    for (const adminFeature of authorization.ADMIN_ONLY_FEATURES) {
      expect(afterBackfill.features).not.toContain(adminFeature);
    }
  });

  test("Is idempotent across consecutive calls", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    await orchestrator.createStudio(owner.id);
    await user.setFeatures(owner.id, authorization.ACTIVATED_USER_FEATURES);

    const firstReport = await featureBackfill.reconcileAll();
    expect(firstReport.studio_owners.updated).toBeGreaterThanOrEqual(1);

    const afterFirstRun = await orchestrator.getUserById(owner.id);

    const secondReport = await featureBackfill.reconcileAll();
    expect(secondReport.studio_owners.updated).toBe(0);

    const afterSecondRun = await orchestrator.getUserById(owner.id);
    expect(afterSecondRun.updated_at).toEqual(afterFirstRun.updated_at);
  });
});
