import { createHash } from "node:crypto";
import webserver from "infra/webserver";
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

describe("POST /api/v1/releases/[release_id]/artifacts/upload-url", () => {
  test("requires the existing session cookie", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/releases/11111111-1111-4111-8111-111111111111/artifacts/upload-url`,
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      name: "UnauthorizedError",
      action: "Sign in and send the session_id cookie",
    });
  });

  test("rejects an authenticated user who does not control the game", async () => {
    const { release } = await createRelease();
    const attacker = await orchestrator.createUser();
    await orchestrator.activateUser(attacker.id);
    await orchestrator.addFeaturesToUser(attacker.id, ["create:game_artifact"]);
    const session = await orchestrator.createSession(attacker.id);

    const response = await requestUpload(
      release.id,
      session.token,
      artifactDeclaration(Buffer.from("not-a-zip")),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      name: "ForbiddenError",
      message: "You are not allowed to upload artifacts for this game",
    });
  });

  test("creates one pending artifact and reuses it on an identical retry", async () => {
    const { owner, game, release } = await createRelease();
    const session = await orchestrator.createSession(owner.id);
    const archive = Buffer.from("small-windows-x64-zip-fixture");
    const declaration = artifactDeclaration(archive);

    const firstResponse = await requestUpload(
      release.id,
      session.token,
      declaration,
    );
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json();

    expect(first.artifact).toMatchObject({
      release_id: release.id,
      platform: "WINDOWS",
      architecture: "X86_64",
      archive_format: "ZIP",
      compressed_size_bytes: archive.byteLength.toString(),
      installed_size_bytes: "4096",
      sha256: declaration.sha256,
      status: "PENDING",
    });
    expect(first.artifact).not.toHaveProperty("storage_object_key");
    expect(first.artifact).not.toHaveProperty("created_by_user_id");
    expect(first.upload.url).toContain("http://");
    expect(new Date(first.upload.expires_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(first.upload.required_headers).toEqual({
      "content-type": "application/zip",
      "x-amz-checksum-sha256": Buffer.from(declaration.sha256, "hex").toString(
        "base64",
      ),
      "x-amz-meta-artifact-id": first.artifact.id,
      "x-amz-meta-declared-size-bytes": archive.byteLength.toString(),
      "x-amz-meta-sha256": declaration.sha256,
    });

    const uploadResponse = await fetch(first.upload.url, {
      method: "PUT",
      headers: first.upload.required_headers,
      body: archive,
    });
    expect(uploadResponse.status).toBe(200);

    const retryResponse = await requestUpload(
      release.id,
      session.token,
      declaration,
    );
    expect(retryResponse.status).toBe(200);
    const retry = await retryResponse.json();
    expect(retry.artifact.id).toBe(first.artifact.id);
    expect(retry.upload.url).toContain(
      `games/${game.id}/releases/${release.id}/artifacts/`,
    );
  });

  test("rejects unsafe entrypoints and non-lowercase SHA-256 values", async () => {
    const { owner, release } = await createRelease();
    const session = await orchestrator.createSession(owner.id);
    const declaration = artifactDeclaration(Buffer.from("archive"));

    for (const invalid of [
      { ...declaration, sha256: declaration.sha256.toUpperCase() },
      {
        ...declaration,
        manifest: { ...declaration.manifest, entrypoint: "../game.exe" },
      },
    ]) {
      const response = await requestUpload(release.id, session.token, invalid);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        name: "ValidationError",
      });
    }
  });

  test("rejects archive formats unsupported by the Desktop MVP", async () => {
    const { owner, release } = await createRelease();
    const session = await orchestrator.createSession(owner.id);
    const declaration = {
      ...artifactDeclaration(Buffer.from("legacy-tar")),
      archive_format: "TAR_GZ",
    };

    const response = await requestUpload(
      release.id,
      session.token,
      declaration,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      name: "ValidationError",
      message: "Invalid artifact upload declaration",
    });
  });
});

async function createRelease() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const game = await orchestrator.createGame(owner.id);
  const release = await gameRelease.createDraft({
    game_id: game.id,
    version: "1.0.0",
  });
  return { owner, game, release };
}

function artifactDeclaration(archive: Buffer) {
  return {
    platform: "WINDOWS",
    architecture: "X86_64",
    archive_format: "ZIP",
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

function requestUpload(releaseId: string, sessionToken: string, body: unknown) {
  return fetch(
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
}
