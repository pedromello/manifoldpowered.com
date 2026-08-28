import { createHash } from "node:crypto";
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

describe("POST /api/v1/artifacts/[artifact_id]/confirm", () => {
  test("requires the existing session cookie", async () => {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/artifacts/11111111-1111-4111-8111-111111111111/confirm`,
      { method: "POST" },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      name: "UnauthorizedError",
      action: "Sign in and send the session_id cookie",
    });
  });

  test("rejects a publisher who does not control the artifact's game", async () => {
    const { owner, release } = await createReleaseValues();
    const ownerSession = await orchestrator.createSession(owner.id);
    const initiated = await initiateThroughApi(
      release.id,
      ownerSession.token,
      artifactDeclaration(Buffer.from("archive")),
    );
    const attacker = await orchestrator.createUser();
    await orchestrator.activateUser(attacker.id);
    await orchestrator.addFeaturesToUser(attacker.id, ["create:game_artifact"]);
    const attackerSession = await orchestrator.createSession(attacker.id);

    const response = await requestConfirmation(
      initiated.artifact.id,
      attackerSession.token,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      name: "ForbiddenError",
      message: "You are not allowed to publish artifacts for this game",
    });
  });

  test("verifies the direct upload, publishes, and returns the same result on retry", async () => {
    const { owner, release } = await createReleaseValues();
    const session = await orchestrator.createSession(owner.id);
    const archive = Buffer.from("small-windows-x64-zip-fixture");
    const initiated = await initiateThroughApi(
      release.id,
      session.token,
      artifactDeclaration(archive),
    );

    const uploadResponse = await fetch(initiated.upload.url, {
      method: "PUT",
      headers: initiated.upload.required_headers,
      body: archive,
    });
    expect(uploadResponse.status).toBe(200);

    const confirmationResponse = await requestConfirmation(
      initiated.artifact.id,
      session.token,
    );
    expect(confirmationResponse.status).toBe(200);
    const confirmation = await confirmationResponse.json();
    expect(confirmation).toMatchObject({
      artifact: {
        id: initiated.artifact.id,
        status: "READY",
      },
      release: {
        id: release.id,
        status: "PUBLISHED",
      },
      published: true,
    });
    expect(confirmation.artifact).not.toHaveProperty("storage_object_key");
    expect(confirmation.artifact).not.toHaveProperty("created_by_user_id");
    expect(confirmation.release.published_at).toEqual(expect.any(String));

    const retryResponse = await requestConfirmation(
      initiated.artifact.id,
      session.token,
    );
    expect(retryResponse.status).toBe(200);
    const retry = await retryResponse.json();
    expect(retry.artifact.id).toBe(confirmation.artifact.id);
    expect(retry.release.published_at).toBe(confirmation.release.published_at);
  });

  test("marks a missing upload as failed without publishing", async () => {
    const { owner, release } = await createReleaseValues();
    const session = await orchestrator.createSession(owner.id);
    const initiated = await initiateThroughApi(
      release.id,
      session.token,
      artifactDeclaration(Buffer.from("missing")),
    );

    const response = await requestConfirmation(
      initiated.artifact.id,
      session.token,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("not found"),
    });
    await expect(
      gameArtifact.findById(initiated.artifact.id),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(gameRelease.findById(release.id)).resolves.toMatchObject({
      status: "FAILED",
      published_at: null,
    });
  });

  test("rejects an uploaded object whose real size differs from its declaration", async () => {
    const { owner, release } = await createReleaseValues();
    const session = await orchestrator.createSession(owner.id);
    const archive = Buffer.from("actual-object");
    const declaration = {
      ...artifactDeclaration(archive),
      compressed_size_bytes: (archive.byteLength + 1).toString(),
    };
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

    const response = await requestConfirmation(
      initiated.artifact.id,
      session.token,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("compressed size"),
    });
  });
});

async function createReleaseValues() {
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
