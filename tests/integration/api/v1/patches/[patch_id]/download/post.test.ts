import storage from "infra/storage";
import { prisma } from "infra/database";
import gameRelease from "models/game_release";
import gameReleasePatch from "models/game_release_patch";
import orchestrator from "tests/orchestrator";
import {
  createBuyer,
  createDeclaredRelease,
  createOwnerGame,
  createReadyPatch,
  hasInternalStorageField,
  patchDeclaration,
  publishDeclaredRelease,
  requestPatchDownload,
  requestPatchUpload,
} from "tests/integration/api/v1/_support/incremental-updates";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/patches/[patch_id]/download", () => {
  test("requires authentication and entitlement", async () => {
    const setup = await createPublishedPatch();
    expect((await requestPatchDownload(setup.patch.id)).status).toBe(401);

    const ownerWithoutEntitlement = await requestPatchDownload(
      setup.patch.id,
      setup.session.token,
    );
    expect(ownerWithoutEntitlement.status).toBe(403);
    await expect(ownerWithoutEntitlement.json()).resolves.toEqual({
      error: {
        code: "ENTITLEMENT_REQUIRED",
        message: "You do not have access to this patch.",
        retryable: false,
      },
    });
  });

  test("returns independent refreshable authorizations without internal object keys", async () => {
    const setup = await createPublishedPatch();
    const { session } = await createBuyer(setup.game.id);

    const response = await requestPatchDownload(setup.patch.id, session.token);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      patch: {
        patch_id: setup.patch.id,
        file: "PATCH",
        total_size_bytes: setup.patch.patch.size_bytes,
        sha256: setup.patch.patch.sha256,
        url: expect.any(String),
        expires_at: expect.any(String),
      },
      signature: {
        patch_id: setup.patch.id,
        file: "SIGNATURE",
        total_size_bytes: setup.patch.signature.size_bytes,
        sha256: setup.patch.signature.sha256,
        url: expect.any(String),
        expires_at: expect.any(String),
      },
    });
    expect(body.patch.url).not.toBe(body.signature.url);
    expect(hasInternalStorageField(body)).toBe(false);
  });

  test("rejects a patch whose target was retired or whose publication is unavailable", async () => {
    const retired = await createPublishedPatch();
    const { session: retiredBuyer } = await createBuyer(retired.game.id);
    await gameRelease.retire(retired.target.release.id);

    const retiredResponse = await requestPatchDownload(
      retired.patch.id,
      retiredBuyer.token,
    );
    expect(retiredResponse.status).toBe(404);
    await expect(retiredResponse.json()).resolves.toMatchObject({
      error: { code: "RELEASE_RETIRED" },
    });

    await orchestrator.clearDatabaseRows();
    const { owner, game, session } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.1.0");
    const pending = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        source.release.id,
        Buffer.from("pending"),
        Buffer.from("signature"),
      ),
    );
    expect(pending.status).toBe(201);
    const pendingBody = await pending.json();
    await publishDeclaredRelease(target);
    const { session: buyer } = await createBuyer(game.id);

    const unavailable = await requestPatchDownload(
      pendingBody.patch.id,
      buyer.token,
    );
    expect(unavailable.status).toBe(404);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "NO_COMPATIBLE_RELEASE" },
    });
  });

  test("detects storage corruption after confirmation and does not issue URLs", async () => {
    const setup = await createPublishedPatch();
    const { session } = await createBuyer(setup.game.id);
    const internal = await gameReleasePatch.findById(setup.patch.id);
    const overwriteUrl = await storage.getUploadUrl(
      internal.patch_storage_object_key,
      "application/vnd.manifold.wharf-patch",
    );
    const overwrite = await fetch(overwriteUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.manifold.wharf-patch",
      },
      body: Uint8Array.from(Buffer.from("corrupted")).buffer,
    });
    expect(overwrite.status).toBe(200);

    const response = await requestPatchDownload(setup.patch.id, session.token);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "INTEGRITY_FAILURE",
        retryable: false,
      },
    });
  });

  test("does not authorize a READY patch bound to different target bytes", async () => {
    const setup = await createPublishedPatch();
    const { session } = await createBuyer(setup.game.id);
    await prisma.gameReleasePatch.update({
      where: { id: setup.patch.id },
      data: { target_artifact_sha256: "f".repeat(64) },
    });

    const response = await requestPatchDownload(setup.patch.id, session.token);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NO_COMPATIBLE_RELEASE" },
    });
  });
});

async function createPublishedPatch() {
  const { owner, game, session } = await createOwnerGame();
  const source = await publishDeclaredRelease(
    await createDeclaredRelease(owner, game, "1.0.0", 1000),
  );
  const target = await createDeclaredRelease(owner, game, "1.1.0", 1000);
  const ready = await createReadyPatch({
    owner,
    sessionToken: session.token,
    source: source.release,
    target: target.release,
    patchSize: 400,
  });
  const publishedTarget = await publishDeclaredRelease(target);
  return {
    owner,
    game,
    session,
    source,
    target: publishedTarget,
    patch: ready.patch,
  };
}
