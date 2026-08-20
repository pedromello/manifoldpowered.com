import { createHash, randomUUID } from "node:crypto";
import {
  Game,
  GameArchitecture,
  GameArchiveFormat,
  GameArtifactStatus,
  GamePlatform,
  GameReleaseStatus,
  User,
} from "generated/prisma/client";
import { prisma } from "infra/database";
import storage from "infra/storage";
import webserver from "infra/webserver";
import gameArtifact from "models/game_artifact";
import gameRelease from "models/game_release";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  await orchestrator.clearStorage();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("POST /api/v1/artifacts/[artifact_id]/download", () => {
  describe("Anonymous user", () => {
    test("returns 401 when the session cookie is missing", async () => {
      const response = await requestDownload(randomUUID());

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
          retryable: false,
        },
      });
    });

    test("does not accept a valid session token as bearer authentication", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestDownload(randomUUID(), undefined, {
        Authorization: `Bearer ${session.token}`,
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
          retryable: false,
        },
      });
    });
  });

  describe("Authenticated user", () => {
    test("returns 403 when the account is not activated", async () => {
      const user = await orchestrator.createUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestDownload(randomUUID(), session.token);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ENTITLEMENT_REQUIRED",
          message: "You do not have permission to perform this action",
          retryable: false,
        },
      });
    });

    test("returns 403 when the user owns a different game", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game);
      const buyer = await createActivatedUser();
      const { game: otherGame } = await createGameOwner();
      await orchestrator.addToLibrary(buyer.id, otherGame.id);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ENTITLEMENT_REQUIRED",
          message: "You do not have access to this artifact.",
          retryable: false,
        },
      });
    });

    test("allows the game owner without a library entitlement", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game);
      const session = await orchestrator.createSession(owner.id);

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(200);
      expectAuthorizationResponse(
        await response.json(),
        published.artifact.id,
        published.archive,
      );
    });

    test("returns the exact filtered authorization with a short-lived signed URL", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);
      const requestedAt = Date.now();

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(200);
      const authorization = await response.json();
      expectAuthorizationResponse(
        authorization,
        published.artifact.id,
        published.archive,
      );

      const signedUrl = new URL(authorization.url);
      expect(signedUrl.origin).not.toBe(webserver.getOrigin());
      expect(signedUrl.searchParams.get("X-Amz-Signature")).toEqual(
        expect.any(String),
      );
      expect(Number(signedUrl.searchParams.get("X-Amz-Expires"))).toBe(
        storage.DOWNLOAD_EXPIRES_IN_SECONDS,
      );

      const expiresAt = Date.parse(authorization.expires_at);
      expect(expiresAt).toBeGreaterThanOrEqual(
        requestedAt + storage.DOWNLOAD_EXPIRES_IN_SECONDS * 1000 - 2_000,
      );
      expect(expiresAt).toBeLessThanOrEqual(
        Date.now() + storage.DOWNLOAD_EXPIRES_IN_SECONDS * 1000 + 2_000,
      );
    });

    test("downloads bytes directly from storage with HTTP Range", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);
      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );
      const authorization = await response.json();

      const rangeResponse = await fetch(authorization.url, {
        headers: { Range: "bytes=2-8" },
      });

      expect(rangeResponse.status).toBe(206);
      expect(rangeResponse.headers.get("content-range")).toBe(
        `bytes 2-8/${published.archive.byteLength}`,
      );
      expect(rangeResponse.headers.get("etag")).toBe(authorization.etag);
      expect(Buffer.from(await rangeResponse.arrayBuffer())).toEqual(
        published.archive.subarray(2, 9),
      );

      const resumedResponse = await fetch(authorization.url, {
        headers: {
          Range: "bytes=9-15",
          "If-Range": authorization.etag,
        },
      });
      expect(resumedResponse.status).toBe(206);
      expect(Buffer.from(await resumedResponse.arrayBuffer())).toEqual(
        published.archive.subarray(9, 16),
      );
    });

    test.each([
      [GameArtifactStatus.PENDING, "pending"],
      [GameArtifactStatus.FAILED, "failed"],
    ])("rejects a %s artifact", async (status, versionSuffix) => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(
        owner,
        game,
        `1.0.0-${versionSuffix}`,
      );
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: { status },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(unavailableArtifactError());
    });

    test("rejects a ready artifact on an unpublished release", async () => {
      const { game } = await createGameOwner();
      const release = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0-draft",
      });
      const artifact = await createReadyArtifactWithoutObject(release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(artifact.id, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(unavailableArtifactError());
    });

    test("rejects an artifact on a failed release", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game, "1.0.0-failed");
      await prisma.gameRelease.update({
        where: { id: published.release.id },
        data: { status: GameReleaseStatus.FAILED },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(unavailableArtifactError());
    });

    test("rejects an artifact on a retired release explicitly", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game);
      await gameRelease.retire(published.release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "RELEASE_RETIRED",
          message: `Release "${published.release.id}" has been retired.`,
          retryable: false,
        },
      });
    });

    test("rejects an archive format unsupported by the desktop installer", async () => {
      const { game } = await createGameOwner();
      const release = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0-legacy-tar",
      });
      const artifact = await createReadyArtifactWithoutObject(
        release.id,
        GameArchiveFormat.TAR_GZ,
      );
      await gameRelease.beginProcessing(release.id);
      await gameRelease.publish(release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(artifact.id, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(unavailableArtifactError());
    });

    test("returns an integrity failure when the published object is missing", async () => {
      const { game } = await createGameOwner();
      const release = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0-missing-object",
      });
      const artifact = await createReadyArtifactWithoutObject(release.id);
      await gameRelease.beginProcessing(release.id);
      await gameRelease.publish(release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(artifact.id, session.token);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "INTEGRITY_FAILURE",
          message: "The published artifact was not found in storage",
          retryable: false,
        },
      });
    });

    test("rejects storage metadata that differs from the published snapshot", async () => {
      const { owner, game } = await createGameOwner();
      const published = await publishRealArtifact(owner, game);
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: {
          compressed_size_bytes: BigInt(published.archive.byteLength + 1),
        },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestDownload(
        published.artifact.id,
        session.token,
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "INTEGRITY_FAILURE",
          message: "The stored artifact failed download integrity validation",
          retryable: false,
        },
      });
    });

    test("returns 404 when the artifact does not exist", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);
      const artifactId = randomUUID();

      const response = await requestDownload(artifactId, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: `Artifact "${artifactId}" was not found.`,
          retryable: false,
        },
      });
    });

    test("returns 400 when the artifact id is malformed", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestDownload("not-a-uuid", session.token);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.message).toBe("Invalid artifact download request");
      expect(body.error.retryable).toBe(false);
      expect(body.error.details.issues).toHaveLength(1);
      expect(body.error.details.issues[0].code).toBe("invalid_format");
      expect(body.error.details.issues[0].path).toEqual(["artifact_id"]);
      expect(body.error.details.issues[0].message).toBe("Invalid UUID");
    });
  });
});

async function createActivatedUser(): Promise<User> {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  return user;
}

async function createGameOwner(): Promise<{ owner: User; game: Game }> {
  const owner = await createActivatedUser();
  const game = await orchestrator.createGame(owner.id, {
    title: `Download Test ${randomUUID()}`,
  });
  return { owner, game };
}

async function createEntitledUser(game: Game): Promise<User> {
  const user = await createActivatedUser();
  await orchestrator.addToLibrary(user.id, game.id);
  return user;
}

async function publishRealArtifact(
  owner: User,
  game: Game,
  version = "1.0.0",
  archiveFormat: GameArchiveFormat = GameArchiveFormat.ZIP,
) {
  const session = await orchestrator.createSession(owner.id);
  const release = await gameRelease.createDraft({
    game_id: game.id,
    version,
  });
  const archive = Buffer.from(`range-capable-${release.id}`);
  const declaration = artifactDeclaration(archive, archiveFormat);
  const initiated = await initiateThroughApi(
    release.id,
    session.token,
    declaration,
  );
  const uploadResponse = await fetch(initiated.upload.url, {
    method: "PUT",
    headers: initiated.upload.required_headers,
    body: archive,
  });
  expect(uploadResponse.status).toBe(200);
  const confirmation = await requestConfirmation(
    initiated.artifact.id,
    session.token,
  );
  expect(confirmation.status).toBe(200);

  return {
    release: await gameRelease.findById(release.id),
    artifact: await gameArtifact.findById(initiated.artifact.id),
    archive,
  };
}

async function createReadyArtifactWithoutObject(
  releaseId: string,
  archiveFormat: GameArchiveFormat = GameArchiveFormat.ZIP,
) {
  const artifact = await gameArtifact.createPending({
    release_id: releaseId,
    platform: GamePlatform.WINDOWS,
    architecture: GameArchitecture.X86_64,
    archive_format: archiveFormat,
    storage_object_key: `tests/${releaseId}/${randomUUID()}-${archiveFormat}`,
  });
  await gameArtifact.markVerifying(artifact.id);
  return gameArtifact.markReady(artifact.id, {
    compressed_size_bytes: "1024",
    installed_size_bytes: "2048",
    sha256: "a".repeat(64),
    manifest: {
      schema_version: "1",
      entrypoint: "game.exe",
      launch_arguments: [],
      executables: ["game.exe"],
      environment: {},
    },
  });
}

function artifactDeclaration(
  archive: Buffer,
  archiveFormat: GameArchiveFormat,
) {
  return {
    platform: GamePlatform.WINDOWS,
    architecture: GameArchitecture.X86_64,
    archive_format: archiveFormat,
    compressed_size_bytes: archive.byteLength.toString(),
    installed_size_bytes: "4096",
    sha256: createHash("sha256").update(archive).digest("hex"),
    manifest: {
      schema_version: "1",
      entrypoint: "game.exe",
      launch_arguments: [],
      executables: ["game.exe"],
      environment: {},
    },
  };
}

async function initiateThroughApi(
  releaseId: string,
  sessionToken: string,
  body: unknown,
) {
  const response = await fetch(
    `${webserver.getOrigin()}/api/v1/releases/${releaseId}/artifacts/upload-url`,
    {
      method: "POST",
      headers: {
        Cookie: `session_id=${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  expect(response.status).toBe(201);
  return response.json();
}

function requestConfirmation(artifactId: string, sessionToken: string) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/artifacts/${artifactId}/confirm`,
    {
      method: "POST",
      headers: { Cookie: `session_id=${sessionToken}` },
    },
  );
}

function requestDownload(
  artifactId: string,
  sessionToken?: string,
  headers: Record<string, string> = {},
) {
  const requestHeaders = { ...headers };
  if (sessionToken) requestHeaders.Cookie = `session_id=${sessionToken}`;
  return fetch(
    `${webserver.getOrigin()}/api/v1/artifacts/${artifactId}/download`,
    { method: "POST", headers: requestHeaders },
  );
}

function expectAuthorizationResponse(
  authorization: Record<string, unknown>,
  artifactId: string,
  archive: Buffer,
) {
  expect(authorization).toEqual({
    artifact_id: artifactId,
    url: expect.any(String),
    expires_at: expect.any(String),
    total_size_bytes: archive.byteLength.toString(),
    sha256: createHash("sha256").update(archive).digest("hex"),
    etag: expect.any(String),
  });
  expect(authorization.sha256).toMatch(/^[a-f0-9]{64}$/);
}

function unavailableArtifactError() {
  return {
    error: {
      code: "NO_COMPATIBLE_RELEASE",
      message: "No compatible published artifact was found.",
      retryable: false,
    },
  };
}
