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

describe("GET /api/v1/games/[slug]/releases/latest", () => {
  describe("Anonymous user", () => {
    test("returns 401 when the session cookie is missing", async () => {
      const response = await requestRelease("missing-game");

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
          retryable: false,
        },
      });
    });

    test("does not accept a bearer token instead of the session cookie", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestRelease("missing-game", undefined, {
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

      const response = await requestRelease("missing-game", session.token);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ENTITLEMENT_REQUIRED",
          message: "You do not have permission to perform this action",
          retryable: false,
        },
      });
    });

    test("returns 403 when the user has no entitlement", async () => {
      const { game } = await createGameOwner();
      const buyer = await createActivatedUser();
      const session = await orchestrator.createSession(buyer.id);

      const response = await requestRelease(game.slug, session.token);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: "ENTITLEMENT_REQUIRED",
          message: "You do not have access to this game release.",
          retryable: false,
        },
      });
    });

    test("allows the game owner without a library entitlement", async () => {
      const { owner, game } = await createGameOwner();
      const published = await createPublishedRelease(game, "1.0.0");
      const session = await orchestrator.createSession(owner.id);

      const response = await requestRelease(game.slug, session.token);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedReleaseSummary(published));
    });

    test("uses the requested platform and architecture exactly", async () => {
      const { game } = await createGameOwner();
      const buyer = await createActivatedUser();
      await orchestrator.addToLibrary(buyer.id, game.id);
      const session = await orchestrator.createSession(buyer.id);

      const macRelease = await createPublishedRelease(
        game,
        "1.0.0-mac",
        GamePlatform.MAC,
        GameArchitecture.AARCH64,
      );
      await createPublishedRelease(game, "2.0.0-windows");

      const response = await requestRelease(
        game.slug,
        session.token,
        undefined,
        "MAC",
        "AARCH64",
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedReleaseSummary(macRelease));
    });

    test("orders compatible releases by monotonic release number", async () => {
      const { game } = await createGameOwner();
      const buyer = await createActivatedUser();
      await orchestrator.addToLibrary(buyer.id, game.id);
      const session = await orchestrator.createSession(buyer.id);
      const firstDraft = await gameRelease.createDraft({
        game_id: game.id,
        version: "99.0.0",
      });
      const secondDraft = await gameRelease.createDraft({
        game_id: game.id,
        version: "1.0.0",
      });

      const newestByNumber = await publishDraft(secondDraft);
      await publishDraft(firstDraft);
      const latestRelease = await prisma.gameRelease.update({
        where: { id: newestByNumber.release.id },
        data: { published_at: new Date("2025-01-01T00:00:00.000Z") },
      });
      await prisma.gameRelease.update({
        where: { id: firstDraft.id },
        data: { published_at: new Date("2026-01-01T00:00:00.000Z") },
      });
      const latest = { ...newestByNumber, release: latestRelease };

      const response = await requestRelease(game.slug, session.token);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedReleaseSummary(latest));
    });

    test("falls back when the newest compatible release is retired", async () => {
      const { game } = await createGameOwner();
      const buyer = await createActivatedUser();
      await orchestrator.addToLibrary(buyer.id, game.id);
      const session = await orchestrator.createSession(buyer.id);

      const previous = await createPublishedRelease(game, "1.0.0");
      const newest = await createPublishedRelease(game, "2.0.0");
      await gameRelease.retire(newest.release.id);

      const response = await requestRelease(game.slug, session.token);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedReleaseSummary(previous));
    });

    test("returns 404 when the release is unpublished or its artifact is incomplete", async () => {
      const { game } = await createGameOwner();
      const buyer = await createActivatedUser();
      await orchestrator.addToLibrary(buyer.id, game.id);
      const session = await orchestrator.createSession(buyer.id);

      await createReadyUnpublishedRelease(game, "1.0.0-draft");
      const incomplete = await createPublishedRelease(game, "2.0.0");
      await prisma.gameArtifact.update({
        where: { id: incomplete.artifact.id },
        data: { status: GameArtifactStatus.PENDING },
      });

      const response = await requestRelease(game.slug, session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "NO_COMPATIBLE_RELEASE",
          message: "No compatible published release was found.",
          retryable: false,
        },
      });
    });

    test("returns 400 with validation context for an unsupported target", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestRelease(
        "any-game",
        session.token,
        undefined,
        "ANDROID",
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid release target",
          retryable: false,
          details: {
            issues: [
              {
                code: "invalid_value",
                values: ["WINDOWS", "MAC", "LINUX"],
                path: ["platform"],
                message:
                  'Invalid option: expected one of "WINDOWS"|"MAC"|"LINUX"',
              },
            ],
          },
        },
      });
    });

    test("returns 404 when the game does not exist", async () => {
      const user = await createActivatedUser();
      const session = await orchestrator.createSession(user.id);

      const response = await requestRelease("missing-game", session.token);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: 'Game "missing-game" was not found.',
          retryable: false,
        },
      });
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
    title: `Release Test ${randomUUID()}`,
  });
  return { owner, game };
}

async function createPublishedRelease(
  game: Game,
  version: string,
  platform: GamePlatform = GamePlatform.WINDOWS,
  architecture: GameArchitecture = GameArchitecture.X86_64,
) {
  const release = await gameRelease.createDraft({
    game_id: game.id,
    version,
  });

  return publishDraft(release, platform, architecture);
}

async function publishDraft(
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
      entrypoint: "game.exe",
      launch_arguments: [],
      executables: ["game.exe"],
      environment: {},
    },
  });
  await gameRelease.beginProcessing(release.id);
  const publishedRelease = await gameRelease.publish(release.id);

  return { release: publishedRelease, artifact: readyArtifact };
}

async function createReadyUnpublishedRelease(game: Game, version: string) {
  const release = await gameRelease.createDraft({
    game_id: game.id,
    version,
  });
  const artifact = await gameArtifact.createPending({
    release_id: release.id,
    platform: GamePlatform.WINDOWS,
    architecture: GameArchitecture.X86_64,
    archive_format: GameArchiveFormat.ZIP,
    storage_object_key: `tests/${release.id}/unpublished.zip`,
  });
  await gameArtifact.markVerifying(artifact.id);
  await gameArtifact.markReady(artifact.id, {
    compressed_size_bytes: "1024",
    installed_size_bytes: "2048",
    sha256: "b".repeat(64),
    manifest: {
      schema_version: "1",
      entrypoint: "game.exe",
      launch_arguments: [],
      executables: ["game.exe"],
      environment: {},
    },
  });
  return release;
}

function expectedReleaseSummary(
  published: Awaited<ReturnType<typeof createPublishedRelease>>,
) {
  return {
    id: published.release.id,
    version: published.release.version,
    release_number: published.release.release_number,
    published_at: published.release.published_at!.toISOString(),
    artifact_id: published.artifact.id,
    target: {
      platform: published.artifact.platform,
      architecture: published.artifact.architecture,
    },
    compressed_size_bytes: "1024",
    installed_size_bytes: "2048",
    sha256: "a".repeat(64),
    manifest_schema_version: "1",
  };
}

function requestRelease(
  slug: string,
  sessionToken?: string,
  headers: Record<string, string> = {},
  platform: string = "WINDOWS",
  architecture: string = "X86_64",
) {
  const requestHeaders = { ...headers };
  if (sessionToken) requestHeaders.Cookie = `session_id=${sessionToken}`;

  const query = new URLSearchParams({ platform, arch: architecture });
  return fetch(
    `${webserver.getOrigin()}/api/v1/games/${slug}/releases/latest?${query}`,
    { headers: requestHeaders },
  );
}
