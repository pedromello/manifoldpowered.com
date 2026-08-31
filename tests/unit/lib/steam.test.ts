import {
  highResolutionSteamHeaderImage,
  resolveSteamHeaderImage,
} from "lib/steam";

describe("highResolutionSteamHeaderImage", () => {
  test("uses Steam's 2x header while preserving its asset version", () => {
    expect(
      highResolutionSteamHeaderImage(
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3405690/asset/header.jpg?t=1787676422",
      ),
    ).toBe(
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3405690/asset/header_2x.jpg?t=1787676422",
    );
  });

  test.each([
    "https://example.com/header.jpg",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/asset/capsule.jpg",
    "not a URL",
  ])("keeps unsupported banner URLs unchanged: %s", (url) => {
    expect(highResolutionSteamHeaderImage(url)).toBe(url);
  });

  test("keeps an absent banner absent", () => {
    expect(highResolutionSteamHeaderImage()).toBeUndefined();
  });
});

describe("resolveSteamHeaderImage", () => {
  const standardHeader =
    "https://cdn.akamai.steamstatic.com/steam/apps/391220/header.jpg";
  const highResolutionHeader =
    "https://cdn.akamai.steamstatic.com/steam/apps/391220/header_2x.jpg";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses the 2x header when Steam serves it as an image", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );

    await expect(resolveSteamHeaderImage(standardHeader)).resolves.toBe(
      highResolutionHeader,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      highResolutionHeader,
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  test("falls back to header.jpg when header_2x.jpg does not exist", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(resolveSteamHeaderImage(standardHeader)).resolves.toBe(
      standardHeader,
    );
  });
});
