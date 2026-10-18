/* eslint-disable @next/next/no-img-element -- These images are rendered to PNG by next/og. */
import type { CSSProperties, ReactNode } from "react";
import type { AppLocale } from "lib/locale";
import { fitPreviewText, type PreviewBanner } from "lib/social-preview";
import { OUTLET_PALETTES } from "components/storefront/presets/config";
import { storeContextFromApi, type StoreApi } from "components/store/types";
import { cleanMetadataText } from "lib/seo";
import { strategosVoidPalette } from "storefronts/strategos-void/palette";
import { neonAlleyPalette } from "storefronts/neon-alley/palette";

function Surface({
  children,
  background,
}: {
  children: ReactNode;
  background: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: 1200,
        height: 630,
        overflow: "hidden",
        background,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Lines({
  value,
  width,
  maxLines,
  maxFont,
  minFont,
  maxHeight,
  style,
}: {
  value: string;
  width: number;
  maxLines: number;
  maxFont: number;
  minFont: number;
  maxHeight?: number;
  style: CSSProperties;
}) {
  const fitted = fitPreviewText(
    value,
    width,
    maxLines,
    maxFont,
    minFont,
    maxHeight,
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        fontSize: fitted.fontSize,
        lineHeight: 1.12,
        ...style,
      }}
    >
      {fitted.lines.map((line, index) => (
        <div key={index} style={{ display: "flex", whiteSpace: "pre" }}>
          {line}
        </div>
      ))}
    </div>
  );
}

function Mark({
  logo,
  color,
  size = 30,
}: {
  logo: string | null;
  color: string;
  size?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, color }}>
      {logo ? (
        <img
          src={logo}
          alt=""
          width={size}
          height={size}
          style={{ objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: size,
            height: size,
            justifyContent: "center",
            alignItems: "center",
            background: "#9b35ef",
            color: "white",
            borderRadius: size / 2,
            fontSize: size * 0.6,
          }}
        >
          M
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontSize: size === 30 ? 20 : 17,
          letterSpacing: 2,
          fontWeight: 400,
        }}
      >
        MANIFOLD
      </div>
    </div>
  );
}

function Banner({
  banner,
  x,
  y,
  width,
  height,
}: {
  banner: PreviewBanner;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <img
      src={banner.image}
      alt={banner.title}
      width={width}
      height={height}
      style={{ position: "absolute", left: x, top: y, objectFit: "contain" }}
    />
  );
}

export function SelectionPreviewCard({
  title,
  outletName,
  count,
  banners,
  logo,
  locale,
}: {
  title: string;
  outletName: string;
  count: number;
  banners: PreviewBanner[];
  logo: string | null;
  locale: AppLocale;
}) {
  const full = banners.length === 3;
  const panel =
    banners.length === 0
      ? { x: 8, y: 8, width: 1184, height: 614 }
      : full
        ? { x: 605, y: 320, width: 587, height: 302 }
        : { x: 605, y: 8, width: 587, height: 614 };
  const quantity =
    locale === "pt-BR"
      ? `SELEÇÃO · ${count} ${count === 1 ? "JOGO" : "JOGOS"}`
      : `SELECTION · ${count} ${count === 1 ? "GAME" : "GAMES"}`;
  return (
    <Surface background="#10091e">
      {banners.map((banner, index) => {
        const x = full && index === 1 ? 605 : 8;
        const y = full
          ? index === 2
            ? 320
            : 8
          : banners.length === 1
            ? 8
            : 8 + index * 312;
        return (
          <Banner
            key={banner.slug}
            banner={banner}
            x={x}
            y={y}
            width={587}
            height={!full && banners.length === 1 ? 614 : 302}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          left: panel.x,
          top: panel.y,
          width: panel.width,
          height: panel.height,
          borderRadius: 6,
          background: "#7c2bd7",
          color: "#ffffff",
        }}
      >
        <div
          style={{ display: "flex", position: "absolute", left: 28, top: 20 }}
        >
          <Mark logo={logo} color="#ffffff" />
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 28,
            top: 26,
            fontSize: 18,
            color: "#eadbff",
          }}
        >
          {quantity}
        </div>
        <Lines
          value={title}
          width={panel.width - 56}
          maxLines={3}
          maxFont={full ? 43 : 58}
          minFont={34}
          style={{
            position: "absolute",
            left: 28,
            top: full ? 78 : 156,
            fontWeight: 700,
          }}
        />
        <Lines
          value={outletName}
          width={panel.width - 56}
          maxLines={1}
          maxFont={23}
          minFont={20}
          style={{
            position: "absolute",
            left: 28,
            bottom: 20,
            color: "#eadbff",
          }}
        />
      </div>
    </Surface>
  );
}

function paleAccent(hex: string): string {
  const channels = hex.replace("#", "").match(/.{2}/g)!;
  return `#${channels
    .map((part) =>
      Math.round(parseInt(part, 16) * 0.55 + 255 * 0.45)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function OutletPreviewCard({
  store,
  banners,
  avatar,
  logo,
  locale,
}: {
  store: StoreApi;
  banners: PreviewBanner[];
  avatar: string | null;
  logo: string | null;
  locale: AppLocale;
}) {
  const identity = storeContextFromApi(store);
  const palette =
    identity.theme_key === "strategos-void"
      ? strategosVoidPalette
      : identity.theme_key === "neon-alley"
        ? neonAlleyPalette
        : (OUTLET_PALETTES[identity.brand_tokens.palette] ??
          OUTLET_PALETTES.manifold);
  const color = palette.bg;
  const hasGames = banners.length > 0;
  const initials = cleanMetadataText(store.name, 120)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  return (
    <Surface background={palette.bg}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: 1200,
          height: hasGames ? 366 : 630,
          background: paleAccent(palette.accent),
          color,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 44,
            top: 32,
            fontSize: 20,
            letterSpacing: 2,
          }}
        >
          {locale === "pt-BR" ? "OUTLET NO MANIFOLD" : "A MANIFOLD OUTLET"}
        </div>
        <Lines
          value={store.name}
          width={760}
          maxLines={3}
          maxFont={72}
          minFont={45}
          maxHeight={182}
          style={{
            position: "absolute",
            left: 44,
            top: hasGames ? 80 : 152,
            fontWeight: 700,
          }}
        />
        {identity.tagline && (
          <Lines
            value={identity.tagline}
            width={1120}
            maxLines={2}
            maxFont={32}
            minFont={26}
            style={{
              position: "absolute",
              left: 44,
              top: hasGames ? 278 : 416,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 1002,
            top: 53,
            width: 148,
            height: 148,
            alignItems: "center",
            justifyContent: "center",
            color,
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              width={148}
              height={148}
              style={{ objectFit: "contain" }}
            />
          ) : (
            initials
          )}
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 986,
            top: hasGames ? 248 : 540,
          }}
        >
          <Mark logo={logo} color={color} size={24} />
        </div>
      </div>
      {hasGames && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 24,
            top: 382,
            fontSize: 19,
            letterSpacing: 2,
            color: palette.muted,
          }}
        >
          {locale === "pt-BR" ? "DESTAQUES DA CURADORIA" : "CURATOR'S PICKS"}
        </div>
      )}
      {banners.map((banner, index) => (
        <Banner
          key={banner.slug}
          banner={banner}
          x={
            (1200 - (banners.length * 376 + (banners.length - 1) * 12)) / 2 +
            index * 388
          }
          y={427}
          width={376}
          height={176}
        />
      ))}
    </Surface>
  );
}
