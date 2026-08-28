import storage, { resolveDownloadExpiresInSeconds } from "infra/storage";

describe("artifact download authorization configuration", () => {
  test("defaults production authorizations to fifteen minutes", () => {
    expect(resolveDownloadExpiresInSeconds(undefined, "production")).toBe(900);
  });

  test("preserves the one-hour development default", () => {
    expect(resolveDownloadExpiresInSeconds(undefined, "development")).toBe(
      3600,
    );
  });

  test("accepts a safe explicit TTL", () => {
    expect(resolveDownloadExpiresInSeconds("1800", "production")).toBe(1800);
  });

  test.each(["60", "0", "1.5", "not-a-number", "604801"])(
    "rejects unsafe TTL %s",
    (value) => {
      expect(() =>
        resolveDownloadExpiresInSeconds(value, "production"),
      ).toThrow("STORAGE_DOWNLOAD_EXPIRES_IN_SECONDS");
    },
  );
});

describe("artifact upload authorization", () => {
  test("binds checksum, content type and declared metadata as signed headers", async () => {
    const authorization = await storage.getArtifactUploadAuthorization({
      key: "games/game/releases/release/artifacts/artifact.zip",
      artifactId: "11111111-1111-4111-8111-111111111111",
      archiveFormat: "ZIP",
      compressedSizeBytes: "1024",
      sha256: "a".repeat(64),
    });
    const url = new URL(authorization.url);
    const signedHeaders =
      url.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];

    expect(signedHeaders).toEqual(
      expect.arrayContaining([
        "content-type",
        "host",
        "x-amz-checksum-sha256",
        "x-amz-meta-artifact-id",
        "x-amz-meta-declared-size-bytes",
        "x-amz-meta-sha256",
      ]),
    );
    expect(url.searchParams.has("x-amz-checksum-sha256")).toBe(false);
    expect(
      [...url.searchParams.keys()].some((key) => key.startsWith("x-amz-meta-")),
    ).toBe(false);
    expect(authorization.required_headers).toMatchObject({
      "content-type": "application/zip",
      "x-amz-checksum-sha256": Buffer.from("a".repeat(64), "hex").toString(
        "base64",
      ),
      "x-amz-meta-declared-size-bytes": "1024",
    });
    expect(new Date(authorization.expires_at).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });
});
