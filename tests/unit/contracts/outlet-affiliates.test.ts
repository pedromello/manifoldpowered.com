import {
  affiliateLinkInputSchema,
  affiliateSnapshotSchema,
  isAffiliateUrl,
  resolveAffiliateLinks,
  type AffiliateLink,
} from "contracts/outlet-affiliates";

function link(overrides: Partial<AffiliateLink> = {}): AffiliateLink {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "gift_card",
    merchant: "amazon",
    platform: "steam",
    media_type: null,
    country: "BR",
    game_id: null,
    game_slug: null,
    url: "https://www.amazon.com.br/s?k=steam&tag=synthetic-20",
    label: null,
    ...overrides,
  };
}
const game = {
  id: "game-1",
  slug: "sample-game",
  platforms: ["steam" as const],
  primary_platform: "steam" as const,
};

describe("affiliate destinations", () => {
  test.each([
    ["amazon", "https://coelhonojapao.com/amazon"],
    ["mercado_livre", "https://coelhonojapao.com/mercadolivre"],
    ["nuuvem", "https://coelhonojapao.com/nuuvem"],
  ] as const)(
    "accepts the approved public %s alias without rewriting it",
    (merchant, url) => {
      expect(isAffiliateUrl(merchant, url)).toBe(true);
      expect(
        affiliateLinkInputSchema.parse({ kind: "storefront", merchant, url })
          .url,
      ).toBe(url);
    },
  );

  test.each([
    ["amazon", "https://coelhonojapao.com/mercadolivre"],
    ["amazon", "https://coelhonojapao.com/nuuvem"],
    ["mercado_livre", "https://coelhonojapao.com/amazon"],
    ["mercado_livre", "https://coelhonojapao.com/nuuvem"],
    ["nuuvem", "https://coelhonojapao.com/amazon"],
    ["nuuvem", "https://coelhonojapao.com/mercadolivre"],
  ] as const)(
    "rejects an alias belonging to another merchant: %s %s",
    (merchant, url) => {
      expect(isAffiliateUrl(merchant, url)).toBe(false);
    },
  );

  test.each([
    "http://coelhonojapao.com/amazon",
    "https://www.coelhonojapao.com/amazon",
    "https://coelhonojapao.com.attacker.example/amazon",
    "https://coelhonojapao.com/amazon/",
    "https://coelhonojapao.com/amazon/other",
    "https://coelhonojapao.com/other",
    "https://coelhonojapao.com/amazon?redirect=https://attacker.example",
    "https://coelhonojapao.com/amazon?",
    "https://coelhonojapao.com/amazon#fragment",
    "https://coelhonojapao.com/amazon#",
    "https://coelhonojapao.com:443/amazon",
    "https://coelhonojapao.com:8443/amazon",
    "https://user:password@coelhonojapao.com/amazon",
    "https://coelhonojapao.com/%61mazon",
    "https://coelhonojapao.com/other/../amazon",
  ])(
    "does not broaden exact aliases to arbitrary custom destinations: %s",
    (url) => {
      expect(isAffiliateUrl("amazon", url)).toBe(false);
    },
  );

  test.each([
    ["amazon", "https://www.amazon.com.br/dp/EXAMPLE?tag=synthetic-20", true],
    ["amazon", "https://amzn.to/example", true],
    ["amazon", "https://amazon.com.br.attacker.example/item", false],
    ["amazon", "https://user:password@amazon.com.br/item", false],
    ["amazon", "http://amazon.com.br/item", false],
    ["amazon", "https://amazon.com.br:8443/item", false],
    ["mercado_livre", "https://www.mercadolivre.com.br/item", true],
    ["mercado_livre", "https://mercadolivre.com/sec/example", true],
    ["mercado_livre", "https://meli.la/example", true],
    ["nuuvem", "https://www.nuuvem.com/br-pt/item/sample", true],
    [
      "nuuvem",
      "https://click.linksynergy.com/deeplink?id=synthetic&mid=46796&murl=https%3A%2F%2Fwww.nuuvem.com%2Fbr-pt%2Fitem%2Fsample",
      true,
    ],
    [
      "nuuvem",
      "https://click.linksynergy.com/deeplink?murl=https%3A%2F%2Fattacker.example",
      false,
    ],
    ["nuuvem", "https://click.linksynergy.com/deeplink?id=synthetic", false],
    ["nuuvem", "https://www.amazon.com.br/item", false],
  ] as const)("%s validates %s", (merchant, url, valid) =>
    expect(isAffiliateUrl(merchant, url)).toBe(valid),
  );

  test("preserves query parameters and rejects mixed-purpose inputs", () => {
    const input = {
      kind: "gift_card",
      merchant: "amazon",
      platform: "steam",
      url: "https://amzn.to/example?tag=synthetic-20&other=%2F",
    };
    expect(affiliateLinkInputSchema.parse(input).url).toBe(input.url);
    expect(
      affiliateLinkInputSchema.safeParse({ ...input, kind: "storefront" })
        .success,
    ).toBe(false);
    expect(
      affiliateLinkInputSchema.safeParse({ ...input, game_slug: "game" })
        .success,
    ).toBe(false);
    expect(
      affiliateLinkInputSchema.safeParse({
        ...input,
        kind: "game",
        game_slug: "game",
      }).success,
    ).toBe(false);
    expect(
      affiliateLinkInputSchema.safeParse({ ...input, country: "US" }).success,
    ).toBe(false);
    expect(affiliateSnapshotSchema.parse({ version: 1, links: [] })).toEqual({
      version: 1,
      links: [],
    });
  });
});

describe("affiliate game resolution", () => {
  test("specific offers replace gift cards only for their merchant/platform", () => {
    const amazonGift = link();
    const amazonGame = link({
      id: "00000000-0000-4000-8000-000000000002",
      kind: "game",
      game_id: game.id,
      game_slug: game.slug,
      media_type: "digital",
    });
    const marketGift = link({
      id: "00000000-0000-4000-8000-000000000003",
      merchant: "mercado_livre",
      url: "https://mercadolivre.com/sec/example",
    });
    const resolved = resolveAffiliateLinks(
      [amazonGift, amazonGame, marketGift],
      game,
    );
    expect(resolved.map((entry) => entry.id)).toEqual([
      amazonGame.id,
      marketGift.id,
    ]);
  });

  test("keeps physical and digital variants and prioritizes a game over another store's gift card", () => {
    const gift = link();
    const digital = link({
      id: "00000000-0000-4000-8000-000000000002",
      kind: "game",
      merchant: "nuuvem",
      game_id: game.id,
      game_slug: game.slug,
      media_type: "digital",
      url: "https://nuuvem.com/br-pt/item/sample",
    });
    const physical = {
      ...digital,
      id: "00000000-0000-4000-8000-000000000003",
      media_type: "physical" as const,
    };
    expect(
      resolveAffiliateLinks([gift, physical, digital], game).map(
        (entry) => entry.id,
      ),
    ).toEqual([digital.id, physical.id, gift.id]);
  });

  test("uses a general catalog instead of unrelated game or platform offers", () => {
    const storefront = link({ kind: "storefront", platform: null });
    const unsupportedGift = link({ platform: "xbox" });
    const unrelated = link({
      kind: "game",
      game_id: "other",
      game_slug: "other",
      media_type: "digital",
    });
    expect(
      resolveAffiliateLinks([storefront, unsupportedGift, unrelated], game),
    ).toEqual([storefront]);
    expect(resolveAffiliateLinks([unsupportedGift, unrelated], game)).toEqual(
      [],
    );
  });

  test("prefers Nuuvem among general catalogs without assigning a platform", () => {
    const general = [
      link({
        id: "00000000-0000-4000-8000-000000000003",
        kind: "storefront",
        merchant: "nuuvem",
        platform: null,
        url: "https://www.nuuvem.com/br-pt/catalog",
      }),
      link({
        id: "00000000-0000-4000-8000-000000000002",
        kind: "storefront",
        merchant: "mercado_livre",
        platform: null,
        url: "https://mercadolivre.com/sec/example",
      }),
      link({ kind: "storefront", platform: null }),
    ];
    const resolved = resolveAffiliateLinks(general, game);
    expect(resolved.map((entry) => entry.merchant)).toEqual([
      "nuuvem",
      "amazon",
      "mercado_livre",
    ]);
    expect(
      resolved.every(
        (entry) =>
          entry.kind === "storefront" &&
          entry.platform === null &&
          entry.game_id === null,
      ),
    ).toBe(true);
    expect(resolved.map((entry) => entry.url)).toEqual([
      general[0].url,
      general[2].url,
      general[1].url,
    ]);
  });

  test.each(["game", "gift_card"] as const)(
    "retains the existing merchant order for %s offers",
    (kind) => {
      const offers = (["nuuvem", "mercado_livre", "amazon"] as const).map(
        (merchant, index) =>
          link({
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            kind,
            merchant,
            game_id: kind === "game" ? game.id : null,
            game_slug: kind === "game" ? game.slug : null,
            media_type: kind === "game" ? "digital" : null,
            url:
              merchant === "nuuvem"
                ? "https://www.nuuvem.com/br-pt/catalog"
                : merchant === "mercado_livre"
                  ? "https://mercadolivre.com/sec/example"
                  : "https://amzn.to/example",
          }),
      );
      expect(
        resolveAffiliateLinks(offers, game).map((entry) => entry.merchant),
      ).toEqual(["amazon", "mercado_livre", "nuuvem"]);
      const amazonOffer = offers.find((entry) => entry.merchant === "amazon")!;
      const nuuvemGeneral = link({
        id: "00000000-0000-4000-8000-000000000004",
        kind: "storefront",
        merchant: "nuuvem",
        platform: null,
        url: "https://www.nuuvem.com/br-pt/catalog",
      });
      expect(resolveAffiliateLinks([nuuvemGeneral, amazonOffer], game)).toEqual(
        [amazonOffer, nuuvemGeneral],
      );
    },
  );

  test("shows general links even when no purchase platform is recognized", () => {
    const general = link({ kind: "storefront", platform: null });
    const gift = link({ id: "00000000-0000-4000-8000-000000000002" });
    expect(
      resolveAffiliateLinks([gift, general], {
        ...game,
        platforms: [],
        primary_platform: null,
      }),
    ).toEqual([general]);
  });

  test("specific and gift-card options suppress only their merchant's general fallback", () => {
    const amazonGeneral = link({
      id: "00000000-0000-4000-8000-000000000001",
      kind: "storefront",
      platform: null,
    });
    const amazonGift = link({ id: "00000000-0000-4000-8000-000000000002" });
    const marketGeneral = link({
      id: "00000000-0000-4000-8000-000000000003",
      kind: "storefront",
      merchant: "mercado_livre",
      platform: null,
      url: "https://mercadolivre.com/sec/example",
    });
    const nuuvemGeneral = link({
      id: "00000000-0000-4000-8000-000000000004",
      kind: "storefront",
      merchant: "nuuvem",
      platform: null,
      url: "https://nuuvem.com/br-pt/catalog",
    });
    const nuuvemSpecific = link({
      id: "00000000-0000-4000-8000-000000000005",
      kind: "game",
      merchant: "nuuvem",
      game_id: game.id,
      game_slug: game.slug,
      media_type: "digital",
      url: "https://nuuvem.com/br-pt/item/sample",
    });
    const resolved = resolveAffiliateLinks(
      [marketGeneral, amazonGeneral, nuuvemGeneral, amazonGift, nuuvemSpecific],
      game,
    );
    expect(resolved).toEqual([nuuvemSpecific, amazonGift, marketGeneral]);
  });

  test("returns a merchant's general catalog once across multiple supported platforms and duplicate rows", () => {
    const general = link({ kind: "storefront", platform: null });
    const duplicate = {
      ...general,
      id: "00000000-0000-4000-8000-000000000002",
    };
    const multiplePlatforms = {
      ...game,
      platforms: ["steam", "nintendo"] as const,
    };
    expect(
      resolveAffiliateLinks([duplicate, general, general], multiplePlatforms),
    ).toEqual([general]);
    expect(
      resolveAffiliateLinks([general, duplicate], multiplePlatforms),
    ).toEqual([general]);
  });

  test("ignores invalid offer URLs before selecting a valid generic fallback", () => {
    const general = link({ kind: "storefront", platform: null });
    const invalidGift = link({
      id: "00000000-0000-4000-8000-000000000002",
      url: "https://attacker.example/amazon",
    });
    const invalidSpecific = link({
      id: "00000000-0000-4000-8000-000000000003",
      kind: "game",
      game_id: game.id,
      game_slug: game.slug,
      media_type: "digital",
      url: "javascript:alert(1)",
    });
    expect(
      resolveAffiliateLinks([invalidGift, invalidSpecific, general], game),
    ).toEqual([general]);
    expect(
      resolveAffiliateLinks(
        [{ ...general, url: "https://attacker.example/catalog" }],
        game,
      ),
    ).toEqual([]);
  });

  test("a compatible gift card suppresses the general catalog once, preserving primary-platform order", () => {
    const general = link({ kind: "storefront", platform: null });
    const steamGift = link({ id: "00000000-0000-4000-8000-000000000002" });
    const nintendoGift = link({
      id: "00000000-0000-4000-8000-000000000003",
      platform: "nintendo",
    });
    expect(
      resolveAffiliateLinks([general, steamGift, nintendoGift], {
        ...game,
        platforms: ["steam", "nintendo"],
        primary_platform: "nintendo",
      }),
    ).toEqual([nintendoGift, steamGift]);
  });

  test("an explicit game link is platform evidence without inferring compatibility from OS tags", () => {
    const specific = link({
      kind: "game",
      game_id: game.id,
      game_slug: game.slug,
      platform: "xbox",
      media_type: "physical",
    });
    const fallback = link({
      id: "00000000-0000-4000-8000-000000000002",
      merchant: "mercado_livre",
      platform: "xbox",
      url: "https://mercadolivre.com/sec/example",
    });
    expect(
      resolveAffiliateLinks([specific, fallback], { ...game, platforms: [] }),
    ).toEqual([specific, fallback]);
  });
});
