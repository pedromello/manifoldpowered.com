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

  test("never falls back to a storefront or an unrelated game/platform", () => {
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
    ).toEqual([]);
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
