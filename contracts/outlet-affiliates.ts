import { z } from "zod";

export const AFFILIATE_MERCHANTS = [
  "amazon",
  "mercado_livre",
  "nuuvem",
] as const;
export const AFFILIATE_PLATFORMS = [
  "steam",
  "nintendo",
  "playstation",
  "xbox",
] as const;
export const AFFILIATE_KINDS = ["storefront", "gift_card", "game"] as const;
export type AffiliateMerchant = (typeof AFFILIATE_MERCHANTS)[number];
export type AffiliatePlatform = (typeof AFFILIATE_PLATFORMS)[number];
export type AffiliateKind = (typeof AFFILIATE_KINDS)[number];
export type AffiliateMediaType = "physical" | "digital";

export type AffiliateLink = {
  id: string;
  kind: AffiliateKind;
  merchant: AffiliateMerchant;
  platform: AffiliatePlatform | null;
  media_type: AffiliateMediaType | null;
  country: "BR";
  game_id: string | null;
  game_slug: string | null;
  game_title?: string | null;
  url: string;
  label: string | null;
};

export const AFFILIATE_MERCHANT_LABELS: Record<AffiliateMerchant, string> = {
  amazon: "Amazon",
  mercado_livre: "Mercado Livre",
  nuuvem: "Nuuvem",
};
export const AFFILIATE_PLATFORM_LABELS: Record<AffiliatePlatform, string> = {
  steam: "Steam",
  nintendo: "Nintendo",
  playstation: "PlayStation",
  xbox: "Xbox",
};

/** Approved public creator aliases, matched literally and only to their merchant.
 * Redirects were checked on 2026-10-27. Do not replace this with a custom-domain
 * allowlist or runtime URL expansion: these exact destinations retain attribution.
 */
export const APPROVED_AFFILIATE_ALIASES: Record<
  AffiliateMerchant,
  readonly string[]
> = {
  amazon: ["https://coelhonojapao.com/amazon"],
  mercado_livre: ["https://coelhonojapao.com/mercadolivre"],
  nuuvem: ["https://coelhonojapao.com/nuuvem"],
};

const secureUrl = (value: string): URL | null => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url
      : null;
  } catch {
    return null;
  }
};
const within = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

/** Check destination syntax without fetching user-controlled URLs or rewriting attribution. */
export function isAffiliateUrl(
  merchant: AffiliateMerchant,
  value: string,
): boolean {
  const url = secureUrl(value);
  if (!url || value.length > 4096) return false;
  if (APPROVED_AFFILIATE_ALIASES[merchant].includes(value)) return true;
  const host = url.hostname.toLowerCase();
  if (merchant === "amazon")
    return within(host, "amazon.com.br") || host === "amzn.to";
  if (merchant === "mercado_livre") {
    return (
      within(host, "mercadolivre.com.br") ||
      host === "mercadolivre.com" ||
      host === "meli.la"
    );
  }
  if (within(host, "nuuvem.com")) return true;
  if (!["click.linksynergy.com", "ad.linksynergy.com"].includes(host))
    return false;
  const destination = secureUrl(url.searchParams.get("murl") ?? "");
  return (
    destination !== null &&
    within(destination.hostname.toLowerCase(), "nuuvem.com")
  );
}

export const affiliateLinkInputSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(AFFILIATE_KINDS),
    merchant: z.enum(AFFILIATE_MERCHANTS),
    platform: z.enum(AFFILIATE_PLATFORMS).nullable().default(null),
    media_type: z.enum(["physical", "digital"]).nullable().default(null),
    country: z.literal("BR").default("BR"),
    game_slug: z.string().trim().min(1).max(255).nullable().default(null),
    url: z.string().trim().min(1).max(4096),
    label: z.string().trim().max(120).nullable().default(null),
  })
  .strict()
  .superRefine((link, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (!isAffiliateUrl(link.merchant, link.url))
      issue("url", "Use an approved HTTPS affiliate URL for this store.");
    if (link.kind === "storefront") {
      if (
        link.platform !== null ||
        link.game_slug !== null ||
        link.media_type !== null
      )
        issue("kind", "General links cannot target a platform or game.");
    } else {
      if (!link.platform) issue("platform", "Choose a platform.");
      if (
        link.kind === "gift_card" &&
        (link.game_slug !== null || link.media_type !== null)
      )
        issue("kind", "Gift cards cannot target a game or media type.");
      if (link.kind === "game" && (!link.game_slug || !link.media_type))
        issue("kind", "Game links require a game and media type.");
    }
  });
export type AffiliateLinkInput = z.infer<typeof affiliateLinkInputSchema>;
export const affiliateWriteSchema = z
  .object({
    expected_draft_revision: z.number().int().positive(),
    link: affiliateLinkInputSchema,
  })
  .strict();
export const affiliateDeleteSchema = z
  .object({
    expected_draft_revision: z.number().int().positive(),
    id: z.uuid(),
  })
  .strict();

export const affiliateLinkSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(AFFILIATE_KINDS),
    merchant: z.enum(AFFILIATE_MERCHANTS),
    platform: z.enum(AFFILIATE_PLATFORMS).nullable(),
    media_type: z.enum(["physical", "digital"]).nullable(),
    country: z.literal("BR"),
    game_id: z.string().nullable(),
    game_slug: z.string().nullable(),
    game_title: z.string().nullable().optional(),
    url: z.string(),
    label: z.string().nullable(),
  })
  .strict();
export type AffiliateSnapshot = { version: 1; links: AffiliateLink[] };
// Explicit output contract: strictNullChecks is disabled in this repository,
// which otherwise makes Zod's nullable output properties appear optional.
export const affiliateSnapshotSchema: z.ZodType<AffiliateSnapshot> = z
  .object({ version: z.literal(1), links: z.array(affiliateLinkSchema) })
  .strict() as z.ZodType<AffiliateSnapshot>;
export const EMPTY_AFFILIATE_SNAPSHOT = {
  version: 1 as const,
  links: [] as AffiliateLink[],
};

/** Specific offers win independently for each merchant/platform. OS tags are never platform evidence. */
export function resolveAffiliateLinks(
  links: readonly AffiliateLink[],
  game: {
    id: string;
    slug: string;
    platforms: readonly AffiliatePlatform[];
    primary_platform?: AffiliatePlatform | null;
  },
): AffiliateLink[] {
  const specific = links.filter(
    (link) =>
      link.kind === "game" &&
      link.game_id === game.id &&
      isAffiliateUrl(link.merchant, link.url),
  );
  const platforms = new Set<AffiliatePlatform>([
    ...game.platforms,
    ...specific
      .map((link) => link.platform)
      .filter((p): p is AffiliatePlatform => p !== null),
  ]);
  const resolved: AffiliateLink[] = [];
  for (const merchant of AFFILIATE_MERCHANTS) {
    for (const platform of platforms) {
      const offers = specific.filter(
        (link) => link.merchant === merchant && link.platform === platform,
      );
      if (offers.length) resolved.push(...offers);
      else
        resolved.push(
          ...links.filter(
            (link) =>
              link.kind === "gift_card" &&
              link.merchant === merchant &&
              link.platform === platform &&
              isAffiliateUrl(link.merchant, link.url),
          ),
        );
    }
  }
  return resolved.sort(
    (a, b) =>
      Number(a.kind !== "game") - Number(b.kind !== "game") ||
      AFFILIATE_MERCHANTS.indexOf(a.merchant) -
        AFFILIATE_MERCHANTS.indexOf(b.merchant) ||
      Number(a.platform !== game.primary_platform) -
        Number(b.platform !== game.primary_platform) ||
      a.id.localeCompare(b.id),
  );
}
