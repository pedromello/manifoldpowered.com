import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import {
  storeContextFromApi,
  type GameDetailApi,
  type StoreApi,
} from "components/store/types";
import type { AppLocale } from "lib/locale";
import {
  cleanMetadataText,
  gameMetadata,
  homeMetadata,
  outletMetadata,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
} from "lib/seo";
import { BESPOKE_OG_ARTWORK, isBespokeThemeKey } from "storefronts/bespoke";

export const config = { runtime: "edge" };

const IMAGE_TIMEOUT_MS = 2500;
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;
const SHARED_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const VERSIONED_CACHE_CONTROL =
  "public, max-age=31536000, s-maxage=31536000, immutable";
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "shared.fastly.steamstatic.com",
  "shared.akamai.steamstatic.com",
  "cdn.akamai.steamstatic.com",
]);

type ImageCandidate = {
  url: string | null | undefined;
  /** Only checked-in, root-relative assets may use the local HTTP dev origin. */
  trustedInternalAsset?: boolean;
};

type PublishedStoreApi = StoreApi & {
  storefront_source: "REVISION";
  published_at: string;
};

const HOME_CATALOG_ART = [
  {
    title: "Twisted Tower",
    url: "/images/social/home-catalog/twisted-tower.jpg",
  },
  {
    title: "MMO98",
    url: "/images/social/home-catalog/mmo98.jpg",
  },
  {
    title: "Capyvarias",
    url: "/images/social/home-catalog/capyvarias.jpg",
  },
] as const;

function requestLocale(request: NextRequest): AppLocale {
  return new URL(request.url).searchParams.get("locale") === "pt-BR"
    ? "pt-BR"
    : "en";
}

async function fetchPublicJson<T>(url: URL): Promise<T | null> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Content API returned ${response.status}`);

  return response.json() as Promise<T>;
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return `data:${contentType};base64,${btoa(binary)}`;
}

function isRootRelativeAsset(candidate: string): boolean {
  return (
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\")
  );
}

function resolveImageUrl(
  candidate: string,
  origin: string,
  trustedInternalAsset: boolean,
): URL | null {
  const isTrustedRelative =
    trustedInternalAsset && isRootRelativeAsset(candidate);
  let url: URL;

  try {
    // Untrusted presentation URLs must be absolute. This prevents values such
    // as `/api/private` from turning the OG renderer into a same-origin proxy.
    url = isTrustedRelative ? new URL(candidate, origin) : new URL(candidate);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;

  if (isTrustedRelative) {
    return url.origin === origin ? url : null;
  }

  if (url.protocol !== "https:") return null;

  const sameOrigin = url.origin === origin;
  if (!sameOrigin && !ALLOWED_IMAGE_HOSTS.has(url.hostname)) return null;
  if (!sameOrigin && url.port && url.port !== "443") return null;

  return url;
}

function hasRasterSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((byte, index) => bytes[index] === byte);
  }

  if (contentType === "image/gif") {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
  }

  return false;
}

async function readBoundedBody(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      byteLength += value.byteLength;
      if (byteLength > MAX_REMOTE_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function loadImageData(
  candidate: string | null | undefined,
  origin: string,
  trustedInternalAsset = false,
): Promise<string | null> {
  if (!candidate) return null;

  const url = resolveImageUrl(candidate, origin, trustedInternalAsset);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
    });
    const contentType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";
    const declaredLengthHeader = response.headers.get("content-length");
    const declaredLength = declaredLengthHeader
      ? Number(declaredLengthHeader)
      : null;

    if (
      !response.ok ||
      response.redirected ||
      !ALLOWED_IMAGE_TYPES.has(contentType) ||
      (declaredLength !== null &&
        (!Number.isSafeInteger(declaredLength) ||
          declaredLength < 0 ||
          declaredLength > MAX_REMOTE_IMAGE_BYTES))
    ) {
      return null;
    }

    const bytes = await readBoundedBody(response);
    if (!bytes || !hasRasterSignature(bytes, contentType)) return null;

    return bytesToDataUrl(bytes, contentType);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadFirstImageData(
  candidates: ImageCandidate[],
  origin: string,
): Promise<string | null> {
  for (const candidate of candidates) {
    const image = await loadImageData(
      candidate.url,
      origin,
      candidate.trustedInternalAsset,
    );
    if (image) return image;
  }

  return null;
}

export function publishedStoreFromResponse(
  value: unknown,
): PublishedStoreApi | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const isNullableString = (field: unknown) =>
    field === null || typeof field === "string";
  const presentation =
    candidate.presentation && typeof candidate.presentation === "object"
      ? (candidate.presentation as Record<string, unknown>)
      : null;
  if (
    candidate.storefront_source !== "REVISION" ||
    typeof candidate.published_at !== "string" ||
    !Number.isFinite(Date.parse(candidate.published_at)) ||
    typeof candidate.slug !== "string" ||
    typeof candidate.name !== "string" ||
    !isNullableString(candidate.description) ||
    !isNullableString(candidate.logo_url) ||
    !presentation ||
    presentation.version !== 1 ||
    !isNullableString(presentation.theme_key) ||
    !isNullableString(presentation.layout_preset) ||
    !isNullableString(presentation.tagline) ||
    !isNullableString(presentation.cover_image_url) ||
    !presentation.social_links ||
    typeof presentation.social_links !== "object" ||
    !presentation.brand_tokens ||
    typeof presentation.brand_tokens !== "object"
  ) {
    return null;
  }

  return value as PublishedStoreApi;
}

export function outletArtworkCandidates(
  store: PublishedStoreApi,
): ImageCandidate[] {
  const presentation = storeContextFromApi(store);
  const bespokeArtwork = isBespokeThemeKey(presentation.theme_key)
    ? BESPOKE_OG_ARTWORK[presentation.theme_key]
    : null;

  return [
    ...(bespokeArtwork
      ? [{ url: bespokeArtwork, trustedInternalAsset: true }]
      : []),
    { url: presentation.cover_url },
    { url: store.logo_url },
  ];
}

function publishedImageHeaders(
  url: URL,
  store: PublishedStoreApi,
  locale: AppLocale,
): Record<string, string> {
  const publishedAt = new Date(store.published_at);
  const version = store.published_at;
  const requestedVersion = url.searchParams.get("v");

  return {
    "Cache-Control":
      requestedVersion === version
        ? VERSIONED_CACHE_CONTROL
        : SHARED_CACHE_CONTROL,
    "Content-Disposition": "inline",
    ETag: `W/"og-outlet-${locale}-${publishedAt.getTime()}"`,
    "Last-Modified": publishedAt.toUTCString(),
  };
}

function BrandLockup({ logo }: { logo: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={logo}
          width={54}
          height={54}
          style={{ objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 54,
            height: 54,
            borderRadius: 15,
            background: "#9b6cff",
            color: "white",
            fontSize: 30,
            fontWeight: 900,
          }}
        >
          M
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontSize: 25,
          fontWeight: 900,
          letterSpacing: "0.16em",
          color: "#ffffff",
        }}
      >
        MANIFOLD
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#120822",
        color: "white",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {children}
      <div
        style={{
          position: "absolute",
          inset: 24,
          display: "flex",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 26,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function HomeCard({
  locale,
  logo,
  catalogArt,
}: {
  locale: AppLocale;
  logo: string | null;
  catalogArt: Array<{ title: string; image: string }>;
}) {
  const metadata = homeMetadata(locale);

  return (
    <Frame>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(circle at 82% 18%, rgba(199,115,255,0.45) 0, rgba(199,115,255,0) 35%), radial-gradient(circle at 9% 90%, rgba(98,55,212,0.6) 0, rgba(98,55,212,0) 43%), linear-gradient(135deg, #251047 0%, #100719 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 58,
          top: 72,
          display: "flex",
          width: 390,
          height: 500,
        }}
      >
        {catalogArt.map((art, index) => (
          <div
            key={art.title}
            style={{
              position: "absolute",
              top: index * 128,
              left: index === 1 ? 42 : index === 2 ? 12 : 0,
              display: "flex",
              width: 340,
              height: 174,
              overflow: "hidden",
              borderRadius: 24,
              transform: `rotate(${index === 0 ? -4 : index === 1 ? 4 : -2}deg)`,
              border: "1px solid rgba(255,255,255,0.35)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
              background: "#1d102e",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={art.image}
              width={340}
              height={174}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          padding: "74px 82px 70px",
        }}
      >
        <BrandLockup logo={logo} />
        <div
          style={{
            position: "absolute",
            left: 82,
            top: 278,
            display: "flex",
            flexDirection: "column",
            width: 650,
          }}
        >
          <div
            style={{
              display: "flex",
              marginBottom: 20,
              color: "#c8a7ff",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.18em",
            }}
          >
            {locale === "pt-BR"
              ? "CATÁLOGO COMPARTILHADO"
              : "ONE SHARED CATALOG"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: locale === "pt-BR" ? 50 : 56,
              lineHeight: 1.06,
              fontWeight: 900,
            }}
          >
            {locale === "pt-BR"
              ? "Descubra seu próximo jogo"
              : metadata.title.replace(/^Manifold — /, "")}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              maxWidth: 720,
              color: "rgba(255,255,255,0.72)",
              fontSize: 24,
              lineHeight: 1.35,
            }}
          >
            {locale === "pt-BR"
              ? "Pérolas escolhidas por criadores independentes."
              : "One library. Independent Outlets. Discovery shaped by people."}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function OutletCard({
  store,
  locale,
  logo,
  artwork,
}: {
  store: StoreApi;
  locale: AppLocale;
  logo: string | null;
  artwork: string | null;
}) {
  const metadata = outletMetadata(store, locale);

  return (
    <Frame>
      {artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={artwork}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            objectFit: "cover",
            opacity: 0.22,
            filter: "blur(22px)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(110deg, rgba(16,7,28,0.98) 20%, rgba(38,14,68,0.9) 67%, rgba(88,37,135,0.8))",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "70px 82px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
          <div
            style={{
              display: "flex",
              marginBottom: 25,
              color: "#c8a7ff",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.18em",
            }}
          >
            {locale === "pt-BR" ? "OUTLET INDEPENDENTE" : "INDEPENDENT OUTLET"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 63,
              lineHeight: 1.03,
              fontWeight: 900,
            }}
          >
            {cleanMetadataText(store.name, 55)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              color: "rgba(255,255,255,0.72)",
              fontSize: 25,
              lineHeight: 1.35,
            }}
          >
            {cleanMetadataText(metadata.description, 135)}
          </div>
          <div style={{ display: "flex", marginTop: 58 }}>
            <BrandLockup logo={logo} />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 320,
            height: 320,
            borderRadius: 54,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 35px 90px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          {artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={artwork}
              width={320}
              height={320}
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 138,
                fontWeight: 900,
                color: "#c8a7ff",
              }}
            >
              {store.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
}

function GameCard({
  game,
  locale,
  logo,
  artwork,
}: {
  game: GameDetailApi;
  locale: AppLocale;
  logo: string | null;
  artwork: string | null;
}) {
  const metadata = gameMetadata(game, locale);

  return (
    <Frame>
      {artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={artwork}
          width={1200}
          height={630}
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: artwork
            ? "linear-gradient(90deg, rgba(9,5,15,0.98) 0%, rgba(9,5,15,0.88) 46%, rgba(9,5,15,0.25) 76%, rgba(9,5,15,0.35) 100%)"
            : "radial-gradient(circle at 85% 20%, rgba(160,91,255,0.48), transparent 38%), linear-gradient(130deg, #281149, #0d0713)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          padding: "68px 82px 66px",
        }}
      >
        <BrandLockup logo={logo} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: artwork ? 700 : 900,
          }}
        >
          <div
            style={{
              display: "flex",
              marginBottom: 18,
              color: "#c8a7ff",
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: "0.16em",
            }}
          >
            {cleanMetadataText(game.developer_name, 50).toUpperCase()}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              lineHeight: 1.02,
              fontWeight: 900,
            }}
          >
            {cleanMetadataText(game.title, 65)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              maxWidth: 680,
              color: "rgba(255,255,255,0.75)",
              fontSize: 24,
              lineHeight: 1.33,
            }}
          >
            {cleanMetadataText(game.description, 135)}
          </div>
          {metadata.commercial && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                marginTop: 28,
                padding: "11px 18px",
                borderRadius: 12,
                background: "#9b6cff",
                color: "white",
                fontSize: 22,
                fontWeight: 900,
              }}
            >
              {metadata.commercial}
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
}

export default async function handler(request: NextRequest) {
  const url = new URL(request.url);
  const locale = requestLocale(request);
  const segments = url.pathname.split("/").filter(Boolean).slice(2);
  const [kind, encodedSlug] = segments;
  let slug: string | undefined;

  try {
    slug = encodedSlug ? decodeURIComponent(encodedSlug) : undefined;
  } catch {
    return new Response("Preview not found", { status: 404 });
  }

  let card: React.ReactElement;
  let imageHeaders: Record<string, string> = {
    "Cache-Control": SHARED_CACHE_CONTROL,
    "Content-Disposition": "inline",
  };

  if (kind === "home" && !slug && segments.length === 1) {
    const brandLogo = await loadImageData(
      "/images/brand/manifold-logo.png",
      url.origin,
      true,
    );
    const catalogImages = await Promise.all(
      HOME_CATALOG_ART.map(async (art) => ({
        title: art.title,
        image: await loadImageData(art.url, url.origin, true),
      })),
    );
    card = (
      <HomeCard
        locale={locale}
        logo={brandLogo}
        catalogArt={catalogImages.flatMap((art) =>
          art.image ? [{ title: art.title, image: art.image }] : [],
        )}
      />
    );
  } else if (kind === "outlet" && slug && segments.length === 2) {
    // This deliberately uses the anonymous public endpoint and never forwards
    // the OG request's cookies or `preview=1`. That endpoint projects only the
    // immutable published revision; the runtime marker below makes us fail
    // closed if that contract ever regresses.
    const storeResponse = await fetchPublicJson<unknown>(
      new URL(`/api/v1/stores/${encodeURIComponent(slug)}`, url.origin),
    );
    const store = publishedStoreFromResponse(storeResponse);
    if (!store) return new Response("Outlet not found", { status: 404 });

    imageHeaders = publishedImageHeaders(url, store, locale);
    if (request.headers.get("if-none-match") === imageHeaders.ETag) {
      return new Response(null, { status: 304, headers: imageHeaders });
    }

    const [brandLogo, artwork] = await Promise.all([
      loadImageData("/images/brand/manifold-logo.png", url.origin, true),
      loadFirstImageData(outletArtworkCandidates(store), url.origin),
    ]);
    card = (
      <OutletCard
        store={store}
        locale={locale}
        logo={brandLogo}
        artwork={artwork}
      />
    );
  } else if (kind === "game" && slug && segments.length === 2) {
    const gameUrl = new URL(
      `/api/v1/items/games/${encodeURIComponent(slug)}`,
      url.origin,
    );
    gameUrl.searchParams.set("locale", locale);
    const game = await fetchPublicJson<GameDetailApi>(gameUrl);
    if (!game) return new Response("Game not found", { status: 404 });

    const [brandLogo, artwork] = await Promise.all([
      loadImageData("/images/brand/manifold-logo.png", url.origin, true),
      loadFirstImageData(
        [game.media?.banner, ...(game.media?.screenshots ?? [])].map(
          (candidate) => ({ url: candidate }),
        ),
        url.origin,
      ),
    ]);
    card = (
      <GameCard
        game={game}
        locale={locale}
        logo={brandLogo}
        artwork={artwork}
      />
    );
  } else {
    return new Response("Preview not found", { status: 404 });
  }

  return new ImageResponse(card, {
    width: SOCIAL_IMAGE_WIDTH,
    height: SOCIAL_IMAGE_HEIGHT,
    headers: imageHeaders,
  });
}
