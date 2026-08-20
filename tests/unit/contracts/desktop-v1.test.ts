import {
  archiveFormatSchema,
  byteSizeSchema,
  createSessionRequestSchema,
  desktopApiVersionSchema,
  desktopArchitectureSchema,
  desktopPlatformSchema,
  installManifestSchema,
  manifestSchemaVersionSchema,
  requestOtpSchema,
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
});
