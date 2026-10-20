import {
  analyticsPageLocation,
  analyticsReferrer,
  isAnalyticsHost,
  isAnalyticsEnabled,
} from "lib/google-analytics";

describe("Google Analytics privacy and environment boundaries", () => {
  test("requires a production build and a valid measurement ID", () => {
    expect(
      isAnalyticsEnabled(
        "www.manifoldpowered.com",
        "production",
        "G-EXAMPLE123",
      ),
    ).toBe(true);
    expect(
      isAnalyticsEnabled(
        "www.manifoldpowered.com",
        "development",
        "G-EXAMPLE123",
      ),
    ).toBe(false);
    expect(
      isAnalyticsEnabled("www.manifoldpowered.com", "test", "G-EXAMPLE123"),
    ).toBe(false);
    expect(isAnalyticsEnabled("localhost", "production", "G-EXAMPLE123")).toBe(
      false,
    );
    expect(
      isAnalyticsEnabled("www.manifoldpowered.com", "production", ""),
    ).toBe(false);
    expect(
      isAnalyticsEnabled("www.manifoldpowered.com", "production", undefined),
    ).toBe(false);
    expect(
      isAnalyticsEnabled("www.manifoldpowered.com", "production", "invalid"),
    ).toBe(false);
  });
  test.each(["manifoldpowered.com", "www.manifoldpowered.com"])(
    "allows the production host %s",
    (hostname) => expect(isAnalyticsHost(hostname)).toBe(true),
  );

  test.each([
    "localhost",
    "127.0.0.1",
    "manifold-preview.vercel.app",
    "manifoldpowered.com.example.com",
  ])("excludes local, preview and unrelated host %s", (hostname) => {
    expect(isAnalyticsHost(hostname)).toBe(false);
  });

  test("removes queries and fragments while retaining public game paths", () => {
    expect(
      analyticsPageLocation(
        "/pt-BR/item/example-game?email=test%40example.com#private",
        "/item/[slug]",
      ),
    ).toBe("https://www.manifoldpowered.com/pt-BR/item/example-game");
  });

  test.each([
    ["/signup/activate/example-token", "/signup/activate/[activation_token]"],
    ["/backoffice/users/example-id", "/backoffice/users/[id]"],
    ["/studio/example-studio", "/studio/[slug]/index"],
    ["/store/example-outlet/manage", "/store/[slug]/manage"],
  ])("redacts private identifiers from %s", (asPath, route) => {
    expect(analyticsPageLocation(`${asPath}?token=private`, route)).toBe(
      `https://www.manifoldpowered.com${route}`,
    );
  });

  test("preserves the locale when redacting an activation token", () => {
    expect(
      analyticsPageLocation(
        "/pt-BR/signup/activate/example-token",
        "/signup/activate/[activation_token]",
      ),
    ).toBe(
      "https://www.manifoldpowered.com/pt-BR/signup/activate/[activation_token]",
    );
  });

  test("keeps public outlet and selection slugs", () => {
    expect(
      analyticsPageLocation(
        "/store/example-outlet/selections/example-selection?preview=true",
        "/store/[slug]/selections/[selectionSlug]",
      ),
    ).toBe(
      "https://www.manifoldpowered.com/store/example-outlet/selections/example-selection",
    );
  });

  test("limits the initial referrer to its origin", () => {
    expect(
      analyticsReferrer("https://example.com/private/path?token=secret#hash"),
    ).toBe("https://example.com/");
    expect(analyticsReferrer("")).toBe("");
    expect(analyticsReferrer("invalid URL")).toBe("");
  });
});
