import { highResolutionSteamHeaderImage } from "lib/steam";

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
