import {
  archiveFormatSchema,
  byteSizeSchema,
  createSessionRequestSchema,
  desktopApiVersionSchema,
  desktopArchitectureSchema,
  desktopPlatformSchema,
  installManifestSchema,
  manifestSchemaVersionSchema,
  PATCH_MAX_FULL_SIZE_PERCENT,
  patchDownloadAuthorizationsSchema,
  releasePatchUploadRequestSchema,
  requestOtpSchema,
  updatePlanSchema,
} from "contracts/desktop/v1";

const releaseId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";

describe("distribution API v1 contract", () => {
  test("defines the supported target vocabulary", () => {
    expect(desktopPlatformSchema.options).toEqual(["WINDOWS", "MAC", "LINUX"]);
    expect(desktopArchitectureSchema.options).toEqual(["X86_64", "AARCH64"]);
  });

  test("limits the Desktop MVP archive contract to ZIP", () => {
    expect(archiveFormatSchema.safeParse("ZIP").success).toBe(true);
    expect(archiveFormatSchema.safeParse("TAR_GZ").success).toBe(false);
  });

  test("rejects an unknown API version", () => {
    expect(desktopApiVersionSchema.safeParse("2").success).toBe(false);
  });

  test("defines a passwordless OTP login flow", () => {
    expect(
      requestOtpSchema.safeParse({
        login: "player@example.com",
      }).success,
    ).toBe(true);
    expect(
      createSessionRequestSchema.safeParse({
        login: "player@example.com",
        code: "123456",
      }).success,
    ).toBe(true);
    expect(
      createSessionRequestSchema.safeParse({
        login: "player@example.com",
        code: "password",
      }).success,
    ).toBe(false);
  });

  test("rejects an unknown manifest schema version", () => {
    expect(manifestSchemaVersionSchema.safeParse("2").success).toBe(false);
    expect(
      installManifestSchema.safeParse({
        schema_version: "2",
        release_id: releaseId,
        artifact_id: artifactId,
        entrypoint: "game/start.exe",
      }).success,
    ).toBe(false);
  });

  test("accepts a complete version 1 manifest", () => {
    const manifest = installManifestSchema.parse({
      schema_version: "1",
      release_id: releaseId,
      artifact_id: artifactId,
      entrypoint: "game/start.exe",
    });

    expect(manifest).toEqual({
      schema_version: "1",
      release_id: releaseId,
      artifact_id: artifactId,
      entrypoint: "game/start.exe",
      launch_arguments: [],
      executables: [],
      environment: {},
    });
  });

  test.each(["/game/start", "../game/start", "game/../../start"])(
    "rejects unsafe manifest path %s",
    (entrypoint) => {
      const result = installManifestSchema.safeParse({
        schema_version: "1",
        release_id: releaseId,
        artifact_id: artifactId,
        entrypoint,
      });

      expect(result.success).toBe(false);
    },
  );

  test.each([
    "C:\\Windows\\System32\\cmd.exe",
    "C:/Windows/System32/cmd.exe",
    "C:drive-relative.exe",
  ])("rejects drive-qualified manifest path %s", (entrypoint) => {
    const result = installManifestSchema.safeParse({
      schema_version: "1",
      release_id: releaseId,
      artifact_id: artifactId,
      entrypoint,
    });

    expect(result.success).toBe(false);
  });

  test("represents byte sizes as unsigned decimal strings", () => {
    expect(byteSizeSchema.safeParse("9007199254740993").success).toBe(true);
    expect(byteSizeSchema.safeParse(9007199254740992).success).toBe(false);
    expect(byteSizeSchema.safeParse("-1").success).toBe(false);
    expect(byteSizeSchema.safeParse("01").success).toBe(false);
  });

  test("freezes Wharf patch declarations at format 1 and the inclusive 80 percent policy", () => {
    const signatureSha256 = "b".repeat(64);
    const declaration = releasePatchUploadRequestSchema.parse({
      source_release_id: releaseId,
      platform: "WINDOWS",
      architecture: "X86_64",
      algorithm: "WHARF",
      format_version: "1",
      patch: { size_bytes: "800", sha256: "a".repeat(64) },
      signature: { size_bytes: "64", sha256: signatureSha256 },
      expected_installation_sha256: signatureSha256,
      generation_duration_ms: "1250",
    });

    expect(declaration.algorithm).toBe("WHARF");
    expect(PATCH_MAX_FULL_SIZE_PERCENT).toBe(80);
    expect(
      releasePatchUploadRequestSchema.safeParse({
        ...declaration,
        expected_installation_sha256: "c".repeat(64),
      }).success,
    ).toBe(false);
  });

  test("models update resolution as PATCH or FULL without signed URLs", () => {
    const publishedAt = "2026-08-29T00:00:00.000Z";
    const patchId = "33333333-3333-4333-8333-333333333333";
    const targetReleaseId = "44444444-4444-4444-8444-444444444444";
    const signatureSha256 = "c".repeat(64);
    const target = {
      id: targetReleaseId,
      version: "1.1.0",
      release_number: 2,
      published_at: publishedAt,
      artifact_id: artifactId,
      target: { platform: "WINDOWS", architecture: "X86_64" },
      compressed_size_bytes: "1000",
      installed_size_bytes: "2000",
      sha256: "d".repeat(64),
      manifest_schema_version: "1",
    };
    const patch = {
      id: patchId,
      source_release_id: releaseId,
      target_release_id: targetReleaseId,
      target: { platform: "WINDOWS", architecture: "X86_64" },
      algorithm: "WHARF",
      format_version: "1",
      status: "READY",
      patch: { size_bytes: "400", sha256: "a".repeat(64) },
      signature: { size_bytes: "64", sha256: signatureSha256 },
      expected_installation_sha256: signatureSha256,
      generation_duration_ms: "1250",
      created_at: publishedAt,
      updated_at: publishedAt,
    };
    const source = { id: releaseId, version: "1.0.0", release_number: 1 };

    const patchPlan = updatePlanSchema.parse({
      strategy: "PATCH",
      source,
      target,
      patch,
      fallback_artifact_id: artifactId,
    });
    const fullPlan = updatePlanSchema.parse({
      strategy: "FULL",
      source,
      target,
      fallback_artifact_id: artifactId,
      reason: "NO_PATCH",
    });

    expect(patchPlan.strategy).toBe("PATCH");
    expect(patchPlan.patch).not.toHaveProperty("url");
    expect(fullPlan.strategy).toBe("FULL");
  });

  test("keeps patch and signature download authorizations independent", () => {
    const value = patchDownloadAuthorizationsSchema.parse({
      patch: {
        patch_id: "33333333-3333-4333-8333-333333333333",
        file: "PATCH",
        url: "https://storage.example/patch",
        expires_at: "2026-08-29T00:15:00.000Z",
        total_size_bytes: "400",
        sha256: "a".repeat(64),
      },
      signature: {
        patch_id: "33333333-3333-4333-8333-333333333333",
        file: "SIGNATURE",
        url: "https://storage.example/signature",
        expires_at: "2026-08-29T00:15:00.000Z",
        total_size_bytes: "64",
        sha256: "b".repeat(64),
      },
    });

    expect(value.patch.url).not.toBe(value.signature.url);
  });
});
