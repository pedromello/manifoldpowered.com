import { randomUUID } from "node:crypto";
import gameRelease from "models/game_release";
import orchestrator from "tests/orchestrator";
import {
  createBuyer,
  createDeclaredRelease,
  createOwnerGame,
  createReadyPatch,
  hasInternalStorageField,
  patchDeclaration,
  publishDeclaredRelease,
  requestPatchUpload,
  requestUpdate,
} from "tests/integration/api/v1/_support/incremental-updates";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/games/[slug]/updates/latest", () => {
  test("requires authentication, read:library, and a real entitlement even for the game owner", async () => {
    const { owner, game, session } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.1.0"),
    );

    expect((await requestUpdate(game.slug, source.release.id)).status).toBe(
      401,
    );
    const ownerResponse = await requestUpdate(
      game.slug,
      source.release.id,
      session.token,
    );
    expect(ownerResponse.status).toBe(403);
    await expect(ownerResponse.json()).resolves.toEqual({
      error: {
        code: "ENTITLEMENT_REQUIRED",
        message: "You do not have access to updates for this game.",
        retryable: false,
      },
    });
  });

  test("returns PATCH at the inclusive 80 percent threshold with a mandatory full fallback", async () => {
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
      patchSize: 800,
    });
    const publishedTarget = await publishDeclaredRelease(target);
    const { session: buyerSession } = await createBuyer(game.id);

    const response = await requestUpdate(
      game.slug,
      source.release.id,
      buyerSession.token,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      strategy: "PATCH",
      source: { id: source.release.id, release_number: 1 },
      target: {
        id: publishedTarget.release.id,
        artifact_id: target.artifact.id,
      },
      patch: {
        id: ready.patch.id,
        status: "READY",
        patch: { size_bytes: "800" },
      },
      fallback_artifact_id: target.artifact.id,
    });
    expect(body.patch).not.toHaveProperty("url");
    expect(hasInternalStorageField(body)).toBe(false);
  });

  test("returns FULL when a READY patch exceeds 80 percent", async () => {
    const { owner, game, session } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0", 1000),
    );
    const target = await createDeclaredRelease(owner, game, "1.1.0", 1000);
    await createReadyPatch({
      owner,
      sessionToken: session.token,
      source: source.release,
      target: target.release,
      patchSize: 801,
    });
    await publishDeclaredRelease(target);
    const { session: buyerSession } = await createBuyer(game.id);

    const response = await requestUpdate(
      game.slug,
      source.release.id,
      buyerSession.token,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      strategy: "FULL",
      reason: "PATCH_EXCEEDS_SIZE_LIMIT",
      fallback_artifact_id: target.artifact.id,
    });
  });

  test("returns explicit FULL reasons for missing, pending, non-predecessor, and retired sources", async () => {
    const { owner, game, session } = await createOwnerGame();
    const first = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const second = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.1.0"),
    );
    const target = await createDeclaredRelease(owner, game, "1.2.0");
    const pendingResponse = await requestPatchUpload(
      target.release.id,
      session.token,
      patchDeclaration(
        second.release.id,
        Buffer.from("pending-patch"),
        Buffer.from("signature"),
      ),
    );
    expect(pendingResponse.status).toBe(201);
    await publishDeclaredRelease(target);
    const { session: buyerSession } = await createBuyer(game.id);

    const stale = await requestUpdate(
      game.slug,
      first.release.id,
      buyerSession.token,
    );
    expect(stale.status).toBe(200);
    await expect(stale.json()).resolves.toMatchObject({
      strategy: "FULL",
      reason: "SOURCE_NOT_PREDECESSOR",
    });

    const pending = await requestUpdate(
      game.slug,
      second.release.id,
      buyerSession.token,
    );
    expect(pending.status).toBe(200);
    await expect(pending.json()).resolves.toMatchObject({
      strategy: "FULL",
      reason: "PATCH_NOT_READY",
    });

    await gameRelease.retire(second.release.id);
    const retired = await requestUpdate(
      game.slug,
      second.release.id,
      buyerSession.token,
    );
    expect(retired.status).toBe(200);
    await expect(retired.json()).resolves.toMatchObject({
      strategy: "FULL",
      reason: "SOURCE_UNAVAILABLE",
    });
  });

  test("returns FULL with NO_PATCH and rejects a source release from another game", async () => {
    const { owner, game } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.1.0"),
    );
    const { session: buyerSession } = await createBuyer(game.id);

    const full = await requestUpdate(
      game.slug,
      source.release.id,
      buyerSession.token,
    );
    expect(full.status).toBe(200);
    const body = await full.json();
    expect(body).toMatchObject({
      strategy: "FULL",
      reason: "NO_PATCH",
      fallback_artifact_id: target.artifact.id,
    });
    expect(hasInternalStorageField(body)).toBe(false);

    const otherGame = await orchestrator.createGame(owner.id, {
      title: `Target mismatch ${randomUUID()}`,
    });
    const otherSource = await publishDeclaredRelease(
      await createDeclaredRelease(owner, otherGame, "1.0.0"),
    );
    const mismatch = await requestUpdate(
      game.slug,
      otherSource.release.id,
      buyerSession.token,
    );
    expect(mismatch.status).toBe(400);
    await expect(mismatch.json()).resolves.toMatchObject({
      error: {
        code: "INVALID_REQUEST",
        message: expect.stringContaining("does not belong"),
      },
    });
  });

  test("does not select retired or unavailable target releases", async () => {
    const { owner, game } = await createOwnerGame();
    const source = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.0.0"),
    );
    const target = await publishDeclaredRelease(
      await createDeclaredRelease(owner, game, "1.1.0"),
    );
    await gameRelease.retire(target.release.id);
    const { session: buyerSession } = await createBuyer(game.id);

    const response = await requestUpdate(
      game.slug,
      source.release.id,
      buyerSession.token,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NO_COMPATIBLE_RELEASE",
        message: "No newer compatible published release was found.",
        retryable: false,
      },
    });
  });
});
