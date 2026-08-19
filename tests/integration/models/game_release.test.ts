import orchestrator from "tests/orchestrator";
import gameRelease from "models/game_release";
import gameArtifact from "models/game_artifact";
import { distributionTargets } from "tests/fixtures/distribution-targets";
import {
  GameArchitecture,
  GameArchiveFormat,
  GamePlatform,
} from "generated/prisma/client";
import storage from "infra/storage";
import { prisma } from "infra/database";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("immutable game release distribution model", () => {
  test("assigns a monotonic release number within each game", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);

    const first = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    const second = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.1.0",
    });

    expect(first.release_number).toBe(1);
    expect(second.release_number).toBe(2);
  });

  test("rejects a logical reference to a missing game", async () => {
    const missingGameId = "11111111-1111-4111-8111-111111111111";

    await expect(
      gameRelease.createDraft({
        game_id: missingGameId,
        version: "1.0.0",
      }),
    ).rejects.toMatchObject({
      name: "NotFoundError",
      message: `Game "${missingGameId}" was not found.`,
    });
  });

  test("supports one immutable artifact per stable distribution target", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });

    for (const target of distributionTargets) {
      await makeArtifactReady(release.id, target.platform, target.architecture);
    }

    const published = await gameRelease.publish(release.id);
    expect(published.status).toBe("PUBLISHED");
    expect(published.published_at).toBeInstanceOf(Date);

    for (const target of distributionTargets) {
      const compatible = await gameRelease.findLatestCompatible(
        game.id,
        target.platform,
        target.architecture,
      );
      expect(compatible?.release.id).toBe(release.id);
      expect(compatible?.artifact.platform).toBe(target.platform);
      expect(compatible?.artifact.architecture).toBe(target.architecture);
    }
  });

  test("refuses publication while an artifact is incomplete", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });

    await gameArtifact.createPending({
      release_id: release.id,
      platform: GamePlatform.WINDOWS,
      architecture: GameArchitecture.X86_64,
      archive_format: GameArchiveFormat.ZIP,
      storage_object_key: `${release.id}/windows-x86_64.zip`,
    });
    await gameRelease.beginProcessing(release.id);

    await expect(gameRelease.publish(release.id)).rejects.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("every artifact is ready"),
    });
  });

  test("removes a pre-publication artifact so its target can be replaced", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    const incorrectKey = `${release.id}/incorrect.zip`;
    const incorrect = await gameArtifact.createPending({
      release_id: release.id,
      platform: GamePlatform.WINDOWS,
      architecture: GameArchitecture.X86_64,
      archive_format: GameArchiveFormat.ZIP,
      storage_object_key: incorrectKey,
    });
    const deleteFile = jest
      .spyOn(storage, "deleteFile")
      .mockResolvedValue(undefined);

    await gameArtifact.remove(incorrect.id);

    expect(deleteFile).toHaveBeenCalledWith(incorrectKey);
    await expect(gameArtifact.findById(incorrect.id)).rejects.toMatchObject({
      name: "NotFoundError",
    });

    const corrected = await gameArtifact.createPending({
      release_id: release.id,
      platform: GamePlatform.WINDOWS,
      architecture: GameArchitecture.X86_64,
      archive_format: GameArchiveFormat.TAR_GZ,
      storage_object_key: `${release.id}/corrected.tar.gz`,
    });
    expect(corrected.id).not.toBe(incorrect.id);

    deleteFile.mockRestore();
  });

  test("initiates an idempotent direct upload with declared integrity metadata", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    const getUploadAuthorization = jest
      .spyOn(storage, "getArtifactUploadAuthorization")
      .mockResolvedValue({
        url: "https://storage.test/signed-upload",
        expires_at: "2026-08-19T23:00:00.000Z",
        required_headers: { "content-type": "application/zip" },
      });
    const declaration = {
      platform: GamePlatform.WINDOWS,
      architecture: GameArchitecture.X86_64,
      archive_format: GameArchiveFormat.ZIP,
      compressed_size_bytes: "1024",
      installed_size_bytes: "2048",
      sha256: "a".repeat(64),
      manifest: {
        schema_version: "1" as const,
        entrypoint: "game.exe",
        launch_arguments: [],
        executables: ["game.exe"],
        environment: {},
      },
    };

    const first = await gameArtifact.initiateUpload(
      release.id,
      owner.id,
      declaration,
    );
    const retry = await gameArtifact.initiateUpload(
      release.id,
      owner.id,
      declaration,
    );

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.artifact.id).toBe(first.artifact.id);
    expect(first.artifact.status).toBe("PENDING");
    expect(first.artifact.sha256).toBe(declaration.sha256);
    expect(first.artifact.storage_object_key).toBe(
      `games/${game.id}/releases/${release.id}/artifacts/${first.artifact.id}.zip`,
    );
    expect(getUploadAuthorization).toHaveBeenCalledTimes(2);

    const persisted = await prisma.gameArtifact.findUniqueOrThrow({
      where: { id: first.artifact.id },
    });
    expect(persisted.created_by_user_id).toBe(owner.id);
    expect(persisted.compressed_size_bytes).toBe(BigInt(1024));

    await expect(
      gameArtifact.initiateUpload(release.id, owner.id, {
        ...declaration,
        sha256: "b".repeat(64),
      }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      action: expect.stringContaining("Remove the unpublished artifact"),
    });

    getUploadAuthorization.mockRestore();
  });

  test("published release and artifact data cannot be changed", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    const artifact = await makeArtifactReady(
      release.id,
      GamePlatform.WINDOWS,
      GameArchitecture.X86_64,
    );
    await gameRelease.publish(release.id);

    await expect(
      gameRelease.updateDraft(release.id, { version: "changed" }),
    ).rejects.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("immutable"),
    });
    await expect(gameArtifact.markVerifying(artifact.id)).rejects.toMatchObject(
      {
        name: "ValidationError",
        message: expect.stringContaining("immutable"),
      },
    );
    await expect(gameArtifact.remove(artifact.id)).rejects.toMatchObject({
      name: "ValidationError",
      message: expect.stringContaining("immutable"),
    });
  });

  test("resolves the newest published release that exactly matches the target", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);

    const older = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    await makeArtifactReady(
      older.id,
      GamePlatform.LINUX,
      GameArchitecture.X86_64,
    );
    await gameRelease.publish(older.id);

    const newer = await gameRelease.createDraft({
      game_id: game.id,
      version: "2.0.0",
    });
    await makeArtifactReady(
      newer.id,
      GamePlatform.WINDOWS,
      GameArchitecture.X86_64,
    );
    await gameRelease.publish(newer.id);

    const linux = await gameRelease.findLatestCompatible(
      game.id,
      GamePlatform.LINUX,
      GameArchitecture.X86_64,
    );
    const windows = await gameRelease.findLatestCompatible(
      game.id,
      GamePlatform.WINDOWS,
      GameArchitecture.X86_64,
    );
    const unsupported = await gameRelease.findLatestCompatible(
      game.id,
      GamePlatform.LINUX,
      GameArchitecture.AARCH64,
    );

    expect(linux?.release.id).toBe(older.id);
    expect(windows?.release.id).toBe(newer.id);
    expect(unsupported).toBeNull();
  });

  test("retirement removes a release from compatibility resolution", async () => {
    const owner = await orchestrator.createUser();
    const game = await orchestrator.createGame(owner.id);
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    await makeArtifactReady(
      release.id,
      GamePlatform.MAC,
      GameArchitecture.AARCH64,
    );
    await gameRelease.publish(release.id);
    await gameRelease.retire(release.id);

    await expect(
      gameRelease.findLatestCompatible(
        game.id,
        GamePlatform.MAC,
        GameArchitecture.AARCH64,
      ),
    ).resolves.toBeNull();
  });
});

async function makeArtifactReady(
  releaseId: string,
  platform: GamePlatform,
  architecture: GameArchitecture,
) {
  const archiveFormat =
    platform === GamePlatform.WINDOWS
      ? GameArchiveFormat.ZIP
      : GameArchiveFormat.TAR_GZ;
  const artifact = await gameArtifact.createPending({
    release_id: releaseId,
    platform,
    architecture,
    archive_format: archiveFormat,
    storage_object_key: `${releaseId}/${platform.toLowerCase()}-${architecture.toLowerCase()}.${archiveFormat === GameArchiveFormat.ZIP ? "zip" : "tar.gz"}`,
  });

  // Processing may already have begun when a release has several targets.
  const release = await gameRelease.findById(releaseId);
  if (release.status === "DRAFT" || release.status === "FAILED") {
    await gameRelease.beginProcessing(releaseId);
  }

  await gameArtifact.markVerifying(artifact.id);
  return gameArtifact.markReady(artifact.id, {
    compressed_size_bytes: "1024",
    installed_size_bytes: "2048",
    sha256: "a".repeat(64),
    manifest: {
      schema_version: "1",
      entrypoint: platform === GamePlatform.WINDOWS ? "game.exe" : "bin/game",
      launch_arguments: [],
      executables: [],
      environment: {},
    },
  });
}
