import { withLocale } from "lib/localized-api";

describe("withLocale", () => {
  test("adds locale while preserving existing query parameters", () => {
    expect(withLocale("/api/v1/games?q=tomb&limit=5", "pt-BR")).toBe(
      "/api/v1/games?q=tomb&limit=5&locale=pt-BR",
    );
  });

  test("replaces an existing locale", () => {
    expect(withLocale("/api/v1/games?locale=en", "pt-BR")).toBe(
      "/api/v1/games?locale=pt-BR",
    );
  });
});
