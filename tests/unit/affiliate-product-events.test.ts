import { clientEventSchema } from "contracts/product-events";
import type { AffiliateLink } from "contracts/outlet-affiliates";
import {
  affiliateClickEvent,
  trackAffiliateLink,
} from "lib/product-events-client";
import {
  officialStoreAvailable,
  validateAffiliateClick,
} from "models/product_event_ingest";
import {
  outboundAnalyticsQuerySchema,
  outboundWindow,
} from "models/product_event_reports";
import authorization from "models/authorization";

const link: AffiliateLink = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "gift_card",
  merchant: "amazon",
  platform: "steam",
  media_type: null,
  country: "BR",
  game_id: null,
  game_slug: null,
  url: "https://www.amazon.com.br/dp/example?tag=synthetic-20",
  label: null,
};
const revision = "10000000-0000-4000-8000-000000000002";
const game = {
  id: "game-1",
  slug: "example-game",
  has_steam: true,
  has_nintendo: false,
  has_playstation: false,
};
const event = () =>
  clientEventSchema.parse({
    ...affiliateClickEvent({
      storeSlug: "outlet-one",
      gameSlug: game.slug,
      link,
      publishedRevisionId: revision,
      placement: "purchase_primary",
    }),
    id: "10000000-0000-4000-8000-000000000003",
    schema_version: 1,
  });
const published = (links: AffiliateLink[] = [link]) => ({
  published_revision_id: revision,
  affiliate_links: { version: 1, links },
});

test("affiliate event contains closed dimensions and no URL or attribution query", () => {
  const input = event();
  expect(input.name).toBe("affiliate_link_clicked");
  expect(JSON.stringify(input)).not.toContain("https://");
  expect(JSON.stringify(input)).not.toContain("synthetic-20");
  expect(
    clientEventSchema.safeParse({
      ...input,
      properties: { ...input.properties, url: link.url },
    }).success,
  ).toBe(false);
  expect(() =>
    trackAffiliateLink({
      storeSlug: "outlet-one",
      link,
      publishedRevisionId: revision,
      placement: "outlet_links",
      isPreview: true,
    }),
  ).not.toThrow();
});

test("affiliate ingestion validates published link, platform and visibility after fallback", () => {
  const input = event();
  if (input.name !== "affiliate_link_clicked")
    throw new Error("Unexpected event");
  expect(validateAffiliateClick(input, published(), game)).toEqual(link);
  expect(() =>
    validateAffiliateClick(
      input,
      { ...published(), published_revision_id: "another-revision" },
      game,
    ),
  ).toThrow();
  expect(() => validateAffiliateClick(input, published([]), game)).toThrow();
  expect(() =>
    validateAffiliateClick(
      { ...input, properties: { ...input.properties, merchant: "nuuvem" } },
      published(),
      game,
    ),
  ).toThrow();
  expect(() =>
    validateAffiliateClick(input, published(), { ...game, has_steam: false }),
  ).toThrow();
  const specific: AffiliateLink = {
    ...link,
    id: "10000000-0000-4000-8000-000000000004",
    kind: "game",
    game_id: game.id,
    game_slug: game.slug,
    media_type: "digital",
  };
  expect(() =>
    validateAffiliateClick(input, published([link, specific]), game),
  ).toThrow();
});

test("general links clicked on the outlet surface cannot claim a purchase placement without game context", () => {
  const general: AffiliateLink = {
    ...link,
    kind: "storefront",
    platform: null,
  };
  const input = clientEventSchema.parse({
    ...affiliateClickEvent({
      storeSlug: "outlet-one",
      link: general,
      publishedRevisionId: revision,
      placement: "outlet_links",
    }),
    id: "10000000-0000-4000-8000-000000000003",
    schema_version: 1,
  });
  if (input.name !== "affiliate_link_clicked")
    throw new Error("Unexpected event");
  expect(input.target).not.toHaveProperty("game_slug");
  expect(validateAffiliateClick(input, published([general]))).toEqual(general);
  expect(() =>
    validateAffiliateClick(
      {
        ...input,
        properties: { ...input.properties, placement: "purchase_primary" },
      },
      published([general]),
    ),
  ).toThrow();
});

test("a published general-store fallback can retain the referring game without claiming a platform", () => {
  const general: AffiliateLink = {
    ...link,
    kind: "storefront",
    platform: null,
  };
  const input = clientEventSchema.parse({
    ...affiliateClickEvent({
      storeSlug: "outlet-one",
      gameSlug: game.slug,
      link: general,
      publishedRevisionId: revision,
      placement: "purchase_primary",
    }),
    id: "10000000-0000-4000-8000-000000000003",
    schema_version: 1,
  });
  if (input.name !== "affiliate_link_clicked")
    throw new Error("Unexpected event");
  expect(input.target.game_slug).toBe(game.slug);
  expect(input.properties).toMatchObject({
    entry_surface: "game_page",
    kind: "storefront",
    platform: null,
    media_type: null,
  });
  expect(validateAffiliateClick(input, published([general]), game)).toEqual(
    general,
  );
  expect(
    validateAffiliateClick(input, published([general]), {
      ...game,
      has_steam: false,
      affiliate_platforms: [],
    }),
  ).toEqual(general);
  expect(() =>
    validateAffiliateClick(
      { ...input, properties: { ...input.properties, platform: "steam" } },
      published([general]),
      game,
    ),
  ).toThrow();
  expect(() =>
    validateAffiliateClick(
      { ...input, properties: { ...input.properties, kind: "game" } },
      published([general]),
      game,
    ),
  ).toThrow();
  expect(() =>
    validateAffiliateClick(
      {
        ...input,
        properties: { ...input.properties, placement: "outlet_links" },
      },
      published([general]),
      game,
    ),
  ).toThrow();
  expect(() =>
    validateAffiliateClick(input, published([general]), undefined),
  ).toThrow();
  expect(() =>
    validateAffiliateClick(
      input,
      { ...published([general]), published_revision_id: "another-revision" },
      game,
    ),
  ).toThrow();
});

test("a general-store fallback hidden by an eligible gift card or specific game cannot forge a click", () => {
  const general: AffiliateLink = {
    ...link,
    id: "10000000-0000-4000-8000-000000000005",
    kind: "storefront",
    platform: null,
  };
  const input = clientEventSchema.parse({
    ...affiliateClickEvent({
      storeSlug: "outlet-one",
      gameSlug: game.slug,
      link: general,
      publishedRevisionId: revision,
      placement: "purchase_alternative",
    }),
    id: "10000000-0000-4000-8000-000000000003",
    schema_version: 1,
  });
  if (input.name !== "affiliate_link_clicked")
    throw new Error("Unexpected event");
  expect(() =>
    validateAffiliateClick(input, published([general, link]), game),
  ).toThrow();
  const specific: AffiliateLink = {
    ...link,
    kind: "game",
    game_id: game.id,
    game_slug: game.slug,
    media_type: "digital",
  };
  expect(() =>
    validateAffiliateClick(input, published([general, specific]), game),
  ).toThrow();
  const incompatible = { ...link, platform: "nintendo" as const };
  expect(
    validateAffiliateClick(input, published([general, incompatible]), game),
  ).toEqual(general);
  const anotherMerchant = {
    ...link,
    merchant: "nuuvem" as const,
    url: "https://www.nuuvem.com/br-pt/catalog",
  };
  expect(
    validateAffiliateClick(input, published([general, anotherMerchant]), game),
  ).toEqual(general);
});

test("PlayStation availability is independent of Nintendo", () => {
  const playstation = {
    has_steam: false,
    has_nintendo: false,
    has_playstation: true,
  };
  expect(officialStoreAvailable("playstation", playstation)).toBe(true);
  expect(officialStoreAvailable("nintendo", playstation)).toBe(false);
  expect(
    officialStoreAvailable("playstation", {
      ...playstation,
      has_nintendo: true,
      has_playstation: false,
    }),
  ).toBe(false);
});

test("foreign-only official availability cannot manufacture a Brazilian gift-card click", () => {
  const input = event();
  if (input.name !== "affiliate_link_clicked")
    throw new Error("Unexpected event");
  expect(officialStoreAvailable("steam", game)).toBe(true);
  expect(() =>
    validateAffiliateClick(input, published(), {
      ...game,
      affiliate_platforms: [],
    }),
  ).toThrow();
});

test("analytics bounds reject invalid, reversed, future and out-of-retention periods", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  expect(outboundWindow({}, now).from.toISOString()).toBe(
    "2026-09-26T12:00:00.000Z",
  );
  expect(outboundWindow({ days: 90 }, now).to.toISOString()).toBe(
    now.toISOString(),
  );
  expect(() => outboundWindow({ from: "2026-10-01T00:00:00Z" }, now)).toThrow();
  expect(() =>
    outboundWindow(
      { from: "2026-10-10T00:00:00Z", to: "2026-10-01T00:00:00Z" },
      now,
    ),
  ).toThrow();
  expect(() =>
    outboundWindow(
      { from: "2026-06-01T00:00:00Z", to: "2026-07-01T00:00:00Z" },
      now,
    ),
  ).toThrow();
  expect(() =>
    outboundWindow(
      { from: "2026-10-01T00:00:00Z", to: "2026-10-27T00:00:00Z" },
      now,
    ),
  ).toThrow();
  expect(outboundAnalyticsQuerySchema.safeParse({ days: "365" }).success).toBe(
    false,
  );
});

test("analytics permissions are scoped and separate from earnings or draft access", () => {
  const outlet = {
    owner_id: "owner",
    members: [
      { user_id: "analyst", permissions: ["read:store_analytics"] },
      { user_id: "finance", permissions: ["read:store_statement"] },
    ],
  };
  const features = authorization.ACTIVATED_USER_FEATURES;
  expect(
    authorization.can(
      { id: "owner", features },
      "read:store_analytics",
      outlet,
    ),
  ).toBe(true);
  expect(
    authorization.can(
      { id: "stranger", features },
      "read:store_analytics",
      outlet,
    ),
  ).toBe(false);
  expect(
    authorization.can(
      { id: "finance", features },
      "read:store_analytics",
      outlet,
    ),
  ).toBe(false);
  const analyst = { id: "analyst", features };
  expect(authorization.can(analyst, "read:store_analytics", outlet)).toBe(true);
  expect(authorization.canReadStoreDraft(analyst, outlet as never)).toBe(false);
  expect(
    authorization.storeManagementCapabilities(analyst, outlet as never)
      .analytics,
  ).toBe(true);
});
