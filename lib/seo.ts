import type { AppLocale } from "lib/locale";
import type { GameDetailApi, StoreApi } from "components/store/types";

export const SITE_ORIGIN = "https://www.manifoldpowered.com";
export const SITE_NAME = "Manifold";
export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;

const TITLE_LIMIT = 65;
const DESCRIPTION_LIMIT = 170;

export type JsonLd = Record<string, unknown> | Record<string, unknown>[];

export function cleanMetadataText(
  value: string | null | undefined,
  maxLength: number,
): string {
  const clean = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) return clean;

  const rawCandidate = clean.slice(0, Math.max(1, maxLength - 1));
  const candidate = rawCandidate.trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const boundary =
    /\s$/.test(rawCandidate) || lastSpace < Math.floor(maxLength * 0.65)
      ? candidate.length
      : lastSpace;

  return `${candidate.slice(0, boundary).replace(/[.,;:!?-]+$/g, "")}…`;
}

export function absoluteUrl(pathOrUrl: string): string {
  try {
    const url = new URL(pathOrUrl, SITE_ORIGIN);
    return url.origin === SITE_ORIGIN ? url.toString() : pathOrUrl;
  } catch {
    return SITE_ORIGIN;
  }
}

export function localizedPath(locale: AppLocale, path: string): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  return locale === "pt-BR"
    ? `/pt-BR${pathname === "/" ? "" : pathname}`
    : pathname;
}

export function canonicalUrl(locale: AppLocale, path: string): string {
  return new URL(localizedPath(locale, path), SITE_ORIGIN).toString();
}

export function languageAlternates(path: string) {
  return {
    en: canonicalUrl("en", path),
    "pt-BR": canonicalUrl("pt-BR", path),
    "x-default": canonicalUrl("en", path),
  } as const;
}

export function ogLocale(locale: AppLocale): "en_US" | "pt_BR" {
  return locale === "pt-BR" ? "pt_BR" : "en_US";
}

export function alternateOgLocale(locale: AppLocale): "en_US" | "pt_BR" {
  return locale === "pt-BR" ? "en_US" : "pt_BR";
}

export function socialImageUrl(
  kind: "home" | "outlet" | "game",
  locale: AppLocale,
  slug?: string,
): string {
  const suffix = slug ? `/${encodeURIComponent(slug)}` : "";
  const url = new URL(`/api/og/${kind}${suffix}`, SITE_ORIGIN);
  url.searchParams.set("locale", locale);
  return url.toString();
}

export function homeMetadata(locale: AppLocale) {
  if (locale === "pt-BR") {
    return {
      title: "Manifold — Jogos descobertos por Outlets de criadores",
      description:
        "Descubra jogos em Outlets independentes selecionadas por criadores, compre em um catálogo compartilhado e mantenha tudo em uma só biblioteca.",
    };
  }

  return {
    title: "Manifold — Games discovered through creator-run Outlets",
    description:
      "Discover games through independent creator-run Outlets, shop one shared catalog, and keep every purchase in a single library.",
  };
}

export function outletMetadata(store: StoreApi, locale: AppLocale) {
  const name =
    cleanMetadataText(store.name, locale === "pt-BR" ? 30 : 34) ||
    "Manifold Outlet";
  const title =
    locale === "pt-BR"
      ? `${name} — Jogos selecionados no Manifold`
      : `${name} — Curated games on Manifold`;
  const fallback =
    locale === "pt-BR"
      ? `Explore a seleção de jogos da Outlet ${name} no catálogo compartilhado do Manifold.`
      : `Explore ${name}'s game selection in Manifold's shared catalog.`;
  const editorialDescription = cleanMetadataText(
    store.description,
    DESCRIPTION_LIMIT,
  );

  return {
    title: cleanMetadataText(title, TITLE_LIMIT),
    description: editorialDescription || fallback,
  };
}

export function gameCommercialLabel(game: GameDetailApi, locale: AppLocale) {
  const amount = game.display_price?.amount;
  const symbol = game.display_price?.symbol ?? "";

  if (amount !== undefined && Number(amount) === 0) {
    return locale === "pt-BR" ? "Grátis" : "Free";
  }

  if (game.discount_label && amount && game.display_price?.base_amount) {
    return `${game.discount_label} · ${symbol}${amount}`;
  }

  return amount ? `${symbol}${amount}` : null;
}

export function gameMetadata(game: GameDetailApi, locale: AppLocale) {
  const titleText = cleanMetadataText(game.title, 30) || "Game";
  const studio = cleanMetadataText(game.developer_name, 18);
  const title = studio
    ? locale === "pt-BR"
      ? `${titleText}, de ${studio} — Manifold`
      : `${titleText} by ${studio} — Manifold`
    : `${cleanMetadataText(game.title, 51) || "Game"} — Manifold`;
  const commercial = gameCommercialLabel(game, locale);
  const contentDescription = cleanMetadataText(
    game.description,
    commercial ? 145 : DESCRIPTION_LIMIT,
  );
  const description =
    contentDescription ||
    (locale === "pt-BR"
      ? `${titleText} é um jogo de ${studio || "um estúdio independente"} disponível no Manifold.`
      : `${titleText} is a game by ${studio || "an independent studio"} available on Manifold.`);
  const separator = description && commercial ? " · " : "";

  return {
    title,
    description: cleanMetadataText(
      `${description}${separator}${commercial ?? ""}`,
      DESCRIPTION_LIMIT,
    ),
    commercial,
  };
}

export function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function websiteReference() {
  return { "@id": `${SITE_ORIGIN}/#website` };
}

export function homeJsonLd(locale: AppLocale): JsonLd {
  const metadata = homeMetadata(locale);

  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: SITE_NAME,
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/images/brand/icon-512x512.png`,
      sameAs: [
        "https://github.com/pedromello/manifoldpowered.com",
        "https://x.com/ManifoldPowered",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      description: metadata.description,
      url: SITE_ORIGIN,
      inLanguage: locale,
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
  ];
}

export function outletJsonLd(store: StoreApi, locale: AppLocale): JsonLd {
  const path = `/store/${store.slug}`;
  const metadata = outletMetadata(store, locale);
  const url = canonicalUrl(locale, path);

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#outlet`,
    name: metadata.title,
    description: metadata.description,
    url,
    inLanguage: locale,
    isPartOf: websiteReference(),
    primaryImageOfPage: socialImageUrl("outlet", locale, store.slug),
  };
}

export function gameJsonLd(game: GameDetailApi, locale: AppLocale): JsonLd {
  const path = `/item/${game.slug}`;
  const url = canonicalUrl(locale, path);
  const image = socialImageUrl("game", locale, game.slug);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "@id": `${url}#game`,
    name: cleanMetadataText(game.title, 120),
    description: cleanMetadataText(game.description, 300),
    url,
    image,
    inLanguage: locale,
    isPartOf: websiteReference(),
  };

  if (game.developer_name) {
    jsonLd.author = {
      "@type": "Organization",
      name: cleanMetadataText(game.developer_name, 120),
    };
  }
  if (game.publisher_name) {
    jsonLd.publisher = {
      "@type": "Organization",
      name: cleanMetadataText(game.publisher_name, 120),
    };
  }
  if (game.tags?.length) {
    jsonLd.genre = game.tags
      .slice(0, 12)
      .map((tag) => cleanMetadataText(tag, 40));
  }
  if (game.meta_tags?.platforms?.length) {
    jsonLd.operatingSystem = game.meta_tags.platforms
      .slice(0, 8)
      .map((platform) => cleanMetadataText(platform, 40));
  }
  if (game.display_price?.amount !== undefined && game.display_price.currency) {
    jsonLd["@type"] = ["VideoGame", "Product"];
    jsonLd.offers = {
      "@type": "Offer",
      price: game.display_price.amount,
      priceCurrency: game.display_price.currency,
      url,
    };
  }

  return jsonLd;
}

export function isNoIndexRoute(pathname: string): boolean {
  return [
    /^\/404$/,
    /^\/_error$/,
    /^\/backoffice(?:\/|$)/,
    /^\/library(?:\/|$)/,
    /^\/login(?:\/|$)/,
    /^\/onboarding(?:\/|$)/,
    /^\/search(?:\/|$)/,
    /^\/signup(?:\/|$)/,
    /^\/status(?:\/|$)/,
    /^\/store\/(?:mine|new)(?:\/|$)/,
    /^\/store\/\[slug\]\/manage$/,
    /^\/studio(?:\/|$)/,
  ].some((pattern) => pattern.test(pathname));
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
