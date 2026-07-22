import orchestrator from "tests/orchestrator";
import authorization from "models/authorization";
import user from "models/user";
import featureBackfill from "models/feature_backfill";
import { MEMBER_PERMISSIONS as STUDIO_MEMBER_PERMISSIONS } from "models/studio";

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
