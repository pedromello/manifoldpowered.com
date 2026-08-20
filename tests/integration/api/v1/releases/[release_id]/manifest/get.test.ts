import { randomUUID } from "node:crypto";
import {
  Game,
  GameArchitecture,
  GameArchiveFormat,
  GameArtifactStatus,
  GamePlatform,
  GameRelease,
  User,
} from "generated/prisma/client";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameArtifact from "models/game_artifact";
import gameRelease from "models/game_release";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/releases/[release_id]/manifest", () => {
  describe("Anonymous user", () => {
    test("returns 401 when the session cookie is missing", async () => {
      const response = await requestManifest(randomUUID());

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

      const response = await requestManifest(randomUUID(), undefined, "1", {
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

      const response = await requestManifest(randomUUID(), session.token);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ENTITLEMENT_REQUIRED",
          message: "You do not have permission to perform this action",
          retryable: false,
        },
      });
    });

    test("returns 403 when the user has no game entitlement", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      const buyer = await createActivatedUser();
      const { game: otherGame } = await createGameOwner();
      await orchestrator.addToLibrary(buyer.id, otherGame.id);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ENTITLEMENT_REQUIRED",
          message: "You do not have access to this install manifest.",
          retryable: false,
        },
      });
    });

    test("allows the game owner without a library entitlement", async () => {
      const { owner, game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      const session = await orchestrator.createSession(owner.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedManifest(published));
    });

    test("returns the exact immutable manifest to an entitled user", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      const buyer = await createActivatedUser();
      await orchestrator.addToLibrary(buyer.id, game.id);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedManifest(published));
    });

    test("selects the requested artifact manifest on a multi-target release", async () => {
      const { game } = await createGameOwner();
      const release = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0",
      });
      await createReadyArtifact(release, GamePlatform.WINDOWS);
      const macArtifact = await createReadyArtifact(
        release,
        GamePlatform.MAC,
        GameArchitecture.AARCH64,
      );
      await gameRelease.beginProcessing(release.id);
      const publishedRelease = await gameRelease.publish(release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        release.id,
        session.token,
        "1",
        {},
        macArtifact.id,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expectedManifest({ release: publishedRelease, artifact: macArtifact }),
      );
    });

    test("rejects an ambiguous multi-target manifest request", async () => {
      const { game } = await createGameOwner();
      const release = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0",
      });
      await createReadyArtifact(release, GamePlatform.WINDOWS);
      await createReadyArtifact(
        release,
        GamePlatform.MAC,
        GameArchitecture.AARCH64,
      );
      await gameRelease.beginProcessing(release.id);
      await gameRelease.publish(release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(release.id, session.token);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message:
            "Artifact id is required when a release has multiple ready artifacts",
          retryable: false,
        },
      });
    });

    test("does not resolve an artifact belonging to another release", async () => {
      const { game } = await createGameOwner();
      const first = await createPublishedRelease(game, "1.0.0");
      const second = await createPublishedRelease(game, "1.1.0");
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        first.release.id,
        session.token,
        "1",
        {},
        second.artifact.id,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(noPublishedManifestError());
    });

    test("rejects a draft release", async () => {
      const { game } = await createGameOwner();
      const draft = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0-draft",
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(draft.id, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(noPublishedManifestError());
    });

    test("rejects a failed release", async () => {
      const { game } = await createGameOwner();
      const failed = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0-failed",
      });
      await gameRelease.beginProcessing(failed.id);
      await gameRelease.markFailed(failed.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(failed.id, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(noPublishedManifestError());
    });

    test("rejects a retired release explicitly", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      await gameRelease.retire(published.release.id);
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
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

    test("rejects a published release whose artifact is no longer ready", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: { status: GameArtifactStatus.PENDING },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(noPublishedManifestError());
    });

    test("rejects a corrupted persisted manifest", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: {
          manifest: {
            schema_version: "1",
            release_id: published.release.id,
            artifact_id: published.artifact.id,
            entrypoint: "../game.exe",
            launch_arguments: [],
            executables: [],
            environment: {},
          },
        },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "INTEGRITY_FAILURE",
          message: "The published install manifest failed integrity validation",
          retryable: false,
        },
      });
    });

    test("rejects a manifest bound to a different artifact id", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: {
          manifest: {
            ...expectedManifest(published),
            artifact_id: randomUUID(),
          },
        },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "INTEGRITY_FAILURE",
          message: "The published install manifest failed integrity validation",
          retryable: false,
        },
      });
    });

    test("rejects a manifest bound to a different release id", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: {
          manifest: {
            ...expectedManifest(published),
            release_id: randomUUID(),
          },
        },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "INTEGRITY_FAILURE",
          message: "The published install manifest failed integrity validation",
          retryable: false,
        },
      });
    });

    test("filters unexpected publisher metadata from a stored manifest", async () => {
      const { game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      await prisma.gameArtifact.update({
        where: { id: published.artifact.id },
        data: {
          manifest: {
            ...expectedManifest(published),
            storage_object_key: "publishers/private/game.zip",
            created_by_user_id: randomUUID(),
            editorial_notes: "private",
          },
        },
      });
      const buyer = await createEntitledUser(game);
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestManifest(
        published.release.id,
        session.token,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedManifest(published));
    });

    test("rejects an unsupported manifest schema version", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestManifest(randomUUID(), session.token, "2");

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "UNSUPPORTED_MANIFEST_VERSION",
          message: 'Manifest schema version "2" is not supported',
          retryable: false,
        },
      });
    });

    test("returns 404 when the release does not exist", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);
      const releaseId = randomUUID();

      const response = await requestManifest(releaseId, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: `Release "${releaseId}" was not found.`,
          retryable: false,
        },
      });
    });

    test("returns 400 when schema_version is missing", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestManifest(randomUUID(), session.token, null);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid manifest request",
          retryable: false,
          details: {
            issues: [
              {
                code: "invalid_value",
                values: ["1"],
                path: ["schema_version"],
                message: 'Invalid input: expected "1"',
              },
            ],
          },
        },
      });
    });

    test("returns 400 when the release id is malformed", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestManifest("not-a-uuid", session.token);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.message).toBe("Invalid manifest request");
      expect(body.error.retryable).toBe(false);
      expect(body.error.details.issues).toHaveLength(1);
      expect(body.error.details.issues[0].code).toBe("invalid_format");
      expect(body.error.details.issues[0].path).toEqual(["release_id"]);
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
    title: `Manifest Test ${randomUUID()}`,
  });
  return { owner, game };
}

async function createEntitledUser(game: Game): Promise<User> {
  const user = await createActivatedUser();
  await orchestrator.addToLibrary(user.id, game.id);
  return user;
}

async function createPublishedRelease(game: Game, version: string) {
  const release = await gameRelease.createDraft({
    game_id: game.id,
    version,
  });
  return publishDraft(release);
}

async function publishDraft(release: GameRelease) {
  const readyArtifact = await createReadyArtifact(release);
  await gameRelease.beginProcessing(release.id);
  const publishedRelease = await gameRelease.publish(release.id);
  return { release: publishedRelease, artifact: readyArtifact };
}

async function createReadyArtifact(
  release: GameRelease,
  platform: GamePlatform = GamePlatform.WINDOWS,
  architecture: GameArchitecture = GameArchitecture.X86_64,
) {
  const artifact = await gameArtifact.createPending({
    release_id: release.id,
    platform,
    architecture,
    archive_format: GameArchiveFormat.ZIP,
    storage_object_key: `tests/${release.id}/${platform}-${architecture}.zip`,
  });
  await gameArtifact.markVerifying(artifact.id);
  const readyArtifact = await gameArtifact.markReady(artifact.id, {
    compressed_size_bytes: "1024",
    installed_size_bytes: "2048",
    sha256: "a".repeat(64),
    manifest: {
      schema_version: "1",
      entrypoint: "bin/game.exe",
      launch_arguments: ["--manifold"],
      working_directory: "bin",
      executables: ["bin/game.exe"],
      environment: { MANIFOLD_RELEASE: "1" },
    },
  });
  return readyArtifact;
}

function expectedManifest(
  published: Awaited<ReturnType<typeof createPublishedRelease>>,
) {
  return {
    schema_version: "1",
    release_id: published.release.id,
    artifact_id: published.artifact.id,
    entrypoint: "bin/game.exe",
    launch_arguments: ["--manifold"],
    working_directory: "bin",
    executables: ["bin/game.exe"],
    environment: { MANIFOLD_RELEASE: "1" },
  };
}

function noPublishedManifestError() {
  return {
    error: {
      code: "NO_COMPATIBLE_RELEASE",
      message: "No published install manifest was found.",
      retryable: false,
    },
  };
}

function requestManifest(
  releaseId: string,
  sessionToken?: string,
  schemaVersion: string | null = "1",
  headers: Record<string, string> = {},
  artifactId?: string,
) {
  const requestHeaders = { ...headers };
  if (sessionToken) requestHeaders.Cookie = `session_id=${sessionToken}`;
  const query = new URLSearchParams();
  if (schemaVersion) query.set("schema_version", schemaVersion);
  if (artifactId) query.set("artifact_id", artifactId);

  return fetch(
    `${webserver.getOrigin()}/api/v1/releases/${releaseId}/manifest?${query}`,
    { headers: requestHeaders },
  );
}
