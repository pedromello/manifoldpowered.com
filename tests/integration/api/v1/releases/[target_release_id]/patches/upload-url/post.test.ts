import { randomUUID } from "node:crypto";
import webserver from "infra/webserver";
import gameRelease from "models/game_release";
import orchestrator from "tests/orchestrator";
import {
  createDeclaredRelease,
  createOwnerGame,
  hasInternalStorageField,
  patchDeclaration,
  publishDeclaredRelease,
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

describe("POST /api/v1/releases/[target_release_id]/patches/upload-url", () => {
  test("requires authentication and the artifact publication feature", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/releases/${randomUUID()}/patches/upload-url`,
      { method: "POST" },
    );
    expect(response.status).toBe(401);
  });

  test("rejects a publisher who does not control the target game", async () => {
    const { owner, game } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.1.0");
    const attacker = await orchestrator.createUser();
    await orchestrator.activateUser(attacker.id);
    await orchestrator.addFeaturesToUser(attacker.id, ["create:game_artifact"]);
    const attackerSession = await orchestrator.createSession(attacker.id);

    const response = await requestPatchUpload(
      target.release.id,
      attackerSession.token,
      patchDeclaration(
        source.release.id,
        Buffer.from("patch"),
        Buffer.from("signature"),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      name: "ForbiddenError",
      message: "You are not allowed to upload patches for this game",
    });
  });

  test("creates an idempotent declaration with two independently signed uploads and no internal keys", async () => {
    const { owner, game, session } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.1.0");
    const declaration = patchDeclaration(
      source.release.id,
      Buffer.from("patch"),
      Buffer.from("canonical-signature"),
    );

    const firstResponse = await requestPatchUpload(
      target.release.id,
      session.token,
      declaration,
    );
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json();
    expect(first.patch).toMatchObject({
      source_release_id: source.release.id,
      target_release_id: target.release.id,
      algorithm: "WHARF",
      format_version: "1",
      status: "PENDING",
      expected_installation_sha256: declaration.expected_installation_sha256,
    });
    expect(first.uploads.patch.url).not.toBe(first.uploads.signature.url);
    expect(first.uploads.patch.required_headers).toMatchObject({
      "x-amz-meta-patch-id": first.patch.id,
      "x-amz-meta-patch-file": "PATCH",
    });
    expect(first.uploads.signature.required_headers).toMatchObject({
      "x-amz-meta-patch-id": first.patch.id,
      "x-amz-meta-patch-file": "SIGNATURE",
    });
    expect(hasInternalStorageField(first)).toBe(false);

    const retryResponse = await requestPatchUpload(
      target.release.id,
      session.token,
      declaration,
    );
    expect(retryResponse.status).toBe(200);
    const retry = await retryResponse.json();
    expect(retry.patch.id).toBe(first.patch.id);
  });

  test("rejects a different declaration for the same transition and target", async () => {
    const { owner, game, session } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.1.0");
    const original = patchDeclaration(
      source.release.id,
      Buffer.from("patch-a"),
      Buffer.from("signature"),
    );
    expect(
      (await requestPatchUpload(target.release.id, session.token, original))
        .status,
    ).toBe(201);

    const response = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        source.release.id,
        Buffer.from("patch-b"),
        Buffer.from("signature"),
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("different patch"),
    });
  });

  test("rejects another game, a target mismatch, and a non-exact predecessor", async () => {
    const { owner, game, session } = await createOwnerGame();
    const first = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const exact = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.1.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.2.0");
    const otherGame = await orchestrator.createGame(owner.id, {
      title: `Other patch game ${randomUUID()}`,
    });
    const otherSource = await publishDeclaredRelease(
      await createDeclaredRelease(owner, otherGame, "1.0.0"),
    );

    const wrongGame = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        otherSource.release.id,
        Buffer.from("patch"),
        Buffer.from("signature"),
      ),
    );
    expect(wrongGame.status).toBe(400);
    await expect(wrongGame.json()).resolves.toMatchObject({
      message: expect.stringContaining("same game"),
    });

    const wrongPredecessor = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        first.release.id,
        Buffer.from("patch"),
        Buffer.from("signature"),
      ),
    );
    expect(wrongPredecessor.status).toBe(400);
    await expect(wrongPredecessor.json()).resolves.toMatchObject({
      message: expect.stringContaining("immediately previous"),
    });

    const wrongTarget = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        exact.release.id,
        Buffer.from("patch"),
        Buffer.from("signature"),
        { architecture: "AARCH64" },
      ),
    );
    expect(wrongTarget.status).toBe(400);
    await expect(wrongTarget.json()).resolves.toMatchObject({
      message: expect.stringContaining("declared target"),
    });
  });

  test("rejects a FAILED target because patches must be confirmed while it is draft or processing", async () => {
    const { owner, game, session } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.1.0");
    await gameRelease.beginProcessing(target.release.id);
    await gameRelease.markFailed(target.release.id);

    const response = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        source.release.id,
        Buffer.from("patch"),
        Buffer.from("signature"),
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("is FAILED"),
    });
  });
});
