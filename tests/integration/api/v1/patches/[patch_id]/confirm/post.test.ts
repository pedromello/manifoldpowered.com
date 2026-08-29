import storage from "infra/storage";
import gameReleasePatch from "models/game_release_patch";
import orchestrator from "tests/orchestrator";
import {
  createDeclaredRelease,
  createOwnerGame,
  hasInternalStorageField,
  patchDeclaration,
  publishDeclaredRelease,
  requestPatchConfirmation,
  requestPatchUpload,
  uploadPatchFiles,
} from "tests/integration/api/v1/_support/incremental-updates";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/patches/[patch_id]/confirm", () => {
  test("requires authentication", async () => {
    const response = await requestPatchConfirmation(
      "11111111-1111-4111-8111-111111111111",
      "",
    );
    expect(response.status).toBe(401);
  });

  test("rejects a publisher who does not control the patch game", async () => {
    const setup = await createPendingPatch();
    const attacker = await orchestrator.createUser();
    await orchestrator.activateUser(attacker.id);
    await orchestrator.addFeaturesToUser(attacker.id, ["create:game_artifact"]);
    const session = await orchestrator.createSession(attacker.id);

    const response = await requestPatchConfirmation(
      setup.initiated.patch.id,
      session.token,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      message: "You are not allowed to confirm patches for this game",
    });
  });

  test("confirms both objects, remains idempotent, and never publishes the target ZIP", async () => {
    const setup = await createPendingPatch();
    await uploadPatchFiles(setup.initiated, setup.patchFile, setup.signature);

    const response = await requestPatchConfirmation(
      setup.initiated.patch.id,
      setup.session.token,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.patch).toMatchObject({
      id: setup.initiated.patch.id,
      status: "READY",
    });
    expect(hasInternalStorageField(body)).toBe(false);

    const retry = await requestPatchConfirmation(
      setup.initiated.patch.id,
      setup.session.token,
    );
    expect(retry.status).toBe(200);
    expect((await retry.json()).patch).toEqual(body.patch);

    const declarationRetry = await requestPatchUpload(
      setup.target.release.id,
      setup.session.token,
      setup.declaration,
    );
    expect(declarationRetry.status).toBe(200);
    await expect(declarationRetry.json()).resolves.toMatchObject({
      patch: { id: setup.initiated.patch.id, status: "READY" },
      uploads: null,
    });
  });

  test("marks the patch FAILED when either object is missing", async () => {
    const setup = await createPendingPatch();
    const patchUpload = await fetch(setup.initiated.uploads.patch.url, {
      method: "PUT",
      headers: setup.initiated.uploads.patch.required_headers,
      body: setup.patchFile,
    });
    expect(patchUpload.status).toBe(200);

    const response = await requestPatchConfirmation(
      setup.initiated.patch.id,
      setup.session.token,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("Signature upload was not found"),
    });
    await expect(
      gameReleasePatch.findById(setup.initiated.patch.id),
    ).resolves.toMatchObject({ status: "FAILED" });
  });

  test("rejects objects uploaded without the mandatory signed metadata", async () => {
    const setup = await createPendingPatch();
    const internal = await gameReleasePatch.findById(setup.initiated.patch.id);
    const patchUrl = await storage.getUploadUrl(
      internal.patch_storage_object_key,
      "application/vnd.manifold.wharf-patch",
    );
    const signatureUrl = await storage.getUploadUrl(
      internal.signature_storage_object_key,
      "application/vnd.manifold.wharf-signature",
    );
    expect(
      (
        await fetch(patchUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/vnd.manifold.wharf-patch",
          },
          body: setup.patchFile,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(signatureUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/vnd.manifold.wharf-signature",
          },
          body: setup.signature,
        })
      ).status,
    ).toBe(200);

    const response = await requestPatchConfirmation(
      setup.initiated.patch.id,
      setup.session.token,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining("metadata"),
    });
    await expect(
      gameReleasePatch.findById(setup.initiated.patch.id),
    ).resolves.toMatchObject({ status: "FAILED" });
  });
});

async function createPendingPatch() {
  const { owner, game, session } = await createOwnerGame();
  const source = await publishDeclaredRelease(
    await createDeclaredRelease(owner, game, "1.0.0"),
  );
  const target = await createDeclaredRelease(owner, game, "1.1.0");
  const patchFile = Buffer.from("valid-wharf-patch");
  const signature = Buffer.from("canonical-target-signature");
  const declaration = patchDeclaration(source.release.id, patchFile, signature);
  const response = await requestPatchUpload(
    target.release.id,
    session.token,
    declaration,
  );
  expect(response.status).toBe(201);
  const initiated = await response.json();
  return {
    owner,
    game,
    session,
    source,
    target,
    patchFile,
    signature,
    declaration,
    initiated,
  };
}
