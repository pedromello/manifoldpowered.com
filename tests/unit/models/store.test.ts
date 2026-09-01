import {
  DEFAULT_STORE_BRAND_TOKENS,
  parseStoreDraftIfMatch,
  storeSchema,
  storeUpdateSchema,
} from "models/store";

describe("models/store presentation schemas", () => {
  test.each(["channel", "editorial", "community"])(
    "accepts the allow-listed layout preset %s",
    (layout_preset) => {
      expect(
        storeSchema.safeParse({ name: "Creator Outlet", layout_preset })
          .success,
      ).toBe(true);
    },
  );

  test("accepts a complete, allow-listed identity", () => {
    const result = storeSchema.safeParse({
      name: "Creator Outlet",
      description: "A longer creator bio.",
      tagline: "Indies worth your weekend",
      logo_url: "https://cdn.example.com/logo.png",
      cover_url: "https://cdn.example.com/cover.jpg",
      social_links: {
        website: "https://example.com",
        youtube: "https://youtube.com/@creator",
        twitch: "https://twitch.tv/creator",
        instagram: "https://instagram.com/creator",
        tiktok: "https://tiktok.com/@creator",
        x: "https://x.com/creator",
      },
      brand_tokens: {
        palette: "ember",
        typography: "editorial",
        shape: "crisp",
      },
    });

    expect(result.success).toBe(true);
  });

  test.each([
    { layout_preset: "bespoke" },
    {
      brand_tokens: {
        palette: "neon",
        typography: "modern",
        shape: "soft",
      },
    },
    {
      brand_tokens: {
        palette: "manifold",
        typography: "serif-url",
        shape: "soft",
      },
    },
    {
      brand_tokens: {
        palette: "manifold",
        typography: "modern",
        shape: "free-form",
      },
    },
  ])("rejects presentation values outside the allow-lists", (invalid) => {
    expect(storeUpdateSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects arbitrary token and social-link keys", () => {
    expect(
      storeUpdateSchema.safeParse({
        brand_tokens: {
          ...DEFAULT_STORE_BRAND_TOKENS,
          css: "body { display: none }",
        },
      }).success,
    ).toBe(false);

    expect(
      storeUpdateSchema.safeParse({
        social_links: { mastodon: "https://social.example/@creator" },
      }).success,
    ).toBe(false);
  });

  test.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg></svg>",
    "ftp://example.com/logo.png",
    "http://example.com/logo.png",
    "not-a-url",
  ])("rejects the unsafe URL scheme in %s", (logo_url) => {
    expect(() => storeUpdateSchema.safeParse({ logo_url })).not.toThrow();
    expect(storeUpdateSchema.safeParse({ logo_url }).success).toBe(false);
  });

  test("parses quoted and bare draft ETags and rejects missing or invalid values", () => {
    expect(parseStoreDraftIfMatch('"3"')).toBe(3);
    expect(parseStoreDraftIfMatch("4")).toBe(4);
    expect(() => parseStoreDraftIfMatch(undefined)).toThrow();
    expect(() => parseStoreDraftIfMatch("0")).toThrow();
    expect(() => parseStoreDraftIfMatch("not-a-version")).toThrow();
  });

  test("does not allow an owner to submit server-controlled identifiers", () => {
    expect(storeUpdateSchema.safeParse({ slug: "neon-alley" }).success).toBe(
      false,
    );
    expect(
      storeUpdateSchema.safeParse({ theme_key: "neon-alley" }).success,
    ).toBe(false);
    expect(
      storeSchema.safeParse({
        name: "Impersonator",
        theme_key: "strategos-void",
      }).success,
    ).toBe(false);
  });

  test("keeps omitted PATCH fields omitted and supports explicit resets", () => {
    expect(storeUpdateSchema.parse({ tagline: "Fresh voice" })).toEqual({
      tagline: "Fresh voice",
    });

    expect(
      storeUpdateSchema.parse({
        description: null,
        logo_url: null,
        tagline: null,
        cover_url: null,
        social_links: null,
        brand_tokens: null,
      }),
    ).toEqual({
      description: null,
      logo_url: null,
      tagline: null,
      cover_url: null,
      social_links: null,
      brand_tokens: null,
    });
  });
});
