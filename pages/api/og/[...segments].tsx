import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import type { GameDetailApi, StoreApi } from "components/store/types";
import type { AppLocale } from "lib/locale";
import {
  cleanMetadataText,
  gameMetadata,
  homeMetadata,
  outletMetadata,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
} from "lib/seo";

export const config = { runtime: "edge" };

const IMAGE_TIMEOUT_MS = 2500;
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "shared.fastly.steamstatic.com",
  "shared.akamai.steamstatic.com",
  "cdn.akamai.steamstatic.com",
]);

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

function bytesToDataUrl(bytes: ArrayBuffer, contentType: string): string {
  const data = new Uint8Array(bytes);
  let binary = "";

  for (let offset = 0; offset < data.length; offset += 0x8000) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  }

  return `data:${contentType};base64,${btoa(binary)}`;
}

async function loadImageData(
  candidate: string | null | undefined,
  origin: string,
): Promise<string | null> {
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate, origin);
  } catch {
    return null;
  }

  const sameOrigin = url.origin === origin;
  if (url.protocol !== "https:" && !(sameOrigin && url.protocol === "http:")) {
    return null;
  }
  if (!sameOrigin && !ALLOWED_IMAGE_HOSTS.has(url.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType =
      response.headers.get("content-type")?.split(";")[0] ?? "";
    const declaredLength = Number(response.headers.get("content-length") || 0);

    if (
      !response.ok ||
      !contentType.startsWith("image/") ||
      declaredLength > MAX_REMOTE_IMAGE_BYTES
    ) {
      return null;
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;

    return bytesToDataUrl(bytes, contentType);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "flex-end",
                padding: "18px 20px",
                background:
                  "linear-gradient(180deg, transparent 42%, rgba(8,4,13,0.88) 100%)",
                color: "white",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.04em",
              }}
            >
              {art.title}
            </div>
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
        <div style={{ display: "flex", flexDirection: "column", width: 760 }}>
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
              fontSize: 56,
              lineHeight: 1.06,
              fontWeight: 900,
            }}
          >
            {metadata.title.replace(/^Manifold — /, "")}
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
              ? "Uma biblioteca. Outlets independentes. Descobertas com curadoria humana."
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
  const brandLogo = await loadImageData(
    "/images/brand/manifold-logo.png",
    url.origin,
  );

  let card: React.ReactElement;

  if (kind === "home" && !slug) {
    const catalogImages = await Promise.all(
      HOME_CATALOG_ART.map(async (art) => ({
        title: art.title,
        image: await loadImageData(art.url, url.origin),
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
  } else if (kind === "outlet" && slug) {
    const store = await fetchPublicJson<StoreApi>(
      new URL(`/api/v1/stores/${encodeURIComponent(slug)}`, url.origin),
    );
    if (!store) return new Response("Outlet not found", { status: 404 });

    const customArtwork =
      store.slug === "strategos-void"
        ? "/storefronts/strategos-void/logo.jpg"
        : store.logo_url;
    const artwork = await loadImageData(customArtwork, url.origin);
    card = (
      <OutletCard
        store={store}
        locale={locale}
        logo={brandLogo}
        artwork={artwork}
      />
    );
  } else if (kind === "game" && slug) {
    const game = await fetchPublicJson<GameDetailApi>(
      new URL(`/api/v1/items/games/${encodeURIComponent(slug)}`, url.origin),
    );
    if (!game) return new Response("Game not found", { status: 404 });

    const artwork = await loadImageData(
      game.media?.banner || game.media?.screenshots?.[0],
      url.origin,
    );
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
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Disposition": "inline",
    },
  });
}
