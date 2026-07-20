import orchestrator from "tests/orchestrator";
import user from "models/user";
import authorization from "models/authorization";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("models/user.ts disable/enable", () => {
  test("disable() overwrites features with DISABLED_USER_FEATURES and returns the previous ones", async () => {
    const createdUser = await orchestrator.createUser();
    await orchestrator.activateUser(createdUser.id);
    const activatedUser = await orchestrator.getUserById(createdUser.id);

    const { user: disabledUser, previousFeatures } = await user.disable(
      createdUser.id,
    );

    expect(disabledUser.features).toEqual(authorization.DISABLED_USER_FEATURES);
    expect(previousFeatures).toEqual(activatedUser.features);
  });

  test("enable() restores a given feature list", async () => {
    const createdUser = await orchestrator.createUser();
    await orchestrator.activateUser(createdUser.id);
    const activatedUser = await orchestrator.getUserById(createdUser.id);

    const { previousFeatures } = await user.disable(createdUser.id);
    const restoredUser = await user.enable(createdUser.id, previousFeatures);

    expect(restoredUser.features).toEqual(activatedUser.features);
  });

  test("a disabled admin loses admin features, and enable() restores them too", async () => {
    const admin = await orchestrator.createAdminUser();
    expect(admin.features).toEqual(
      expect.arrayContaining(authorization.ADMIN_ONLY_FEATURES),
    );

    const { previousFeatures } = await user.disable(admin.id);
    const disabledAdmin = await user.findOneById(admin.id);
    expect(disabledAdmin.features).not.toEqual(
      expect.arrayContaining(authorization.ADMIN_ONLY_FEATURES),
    );

    const restoredAdmin = await user.enable(admin.id, previousFeatures);
    expect(restoredAdmin.features).toEqual(admin.features);
  });
});
