/* eslint-disable @next/next/no-img-element -- These images are rendered to PNG by next/og. */
import type { CSSProperties, ReactNode } from "react";
import type { AppLocale } from "lib/locale";
import { fitPreviewText, type PreviewBanner } from "lib/social-preview";
import { OUTLET_PALETTES } from "components/storefront/presets/config";
import type { StorefrontPalette } from "components/storefront/palette";
import { storeContextFromApi, type StoreApi } from "components/store/types";
import type { SelectionPageApi } from "lib/selection-client";
import { cleanMetadataText } from "lib/seo";
import { neonAlleyPalette } from "storefronts/neon-alley/palette";

function previewPalette(
  identity: Pick<StoreApi, "theme_key" | "brand_tokens">,
): StorefrontPalette {
  return identity.theme_key === "neon-alley"
    ? neonAlleyPalette
    : (OUTLET_PALETTES[identity.brand_tokens?.palette ?? "manifold"] ??
        OUTLET_PALETTES.manifold);
}

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
  outlet,
  count,
  banners,
  avatar,
  locale,
}: {
  title: string;
  outlet: SelectionPageApi["outlet"];
  count: number;
  banners: PreviewBanner[];
  avatar: string | null;
  locale: AppLocale;
}) {
  const palette = previewPalette(outlet);
  const panelColors = palette.socialPanel ?? {
    bg: palette.accent,
    fg: palette.accentFg,
  };
  const initials = cleanMetadataText(outlet.name, 120)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  const full = banners.length === 3;
  const panel =
    banners.length === 0
      ? { x: 8, y: 8, width: 1184, height: 614 }
      : full
        ? { x: 605, y: 320, width: 587, height: 302 }
        : { x: 605, y: 8, width: 587, height: 614 };
  const quantity =
    locale === "pt-BR"
      ? `${count} ${count === 1 ? "jogo" : "jogos"}`
      : `${count} ${count === 1 ? "game" : "games"}`;
  return (
    <Surface background={palette.bg}>
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
          background: panelColors.bg,
          color: panelColors.fg,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 28,
            top: 20,
            width: 112,
            height: 112,
            alignItems: "center",
            justifyContent: "center",
            background: palette.bg,
            color: palette.fg,
            borderRadius: 8,
            fontSize: 50,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt={outlet.name}
              width={112}
              height={112}
              style={{ objectFit: "contain" }}
            />
          ) : (
            initials
          )}
        </div>
        <Lines
          value={outlet.name}
          width={panel.width - 184}
          maxLines={2}
          maxFont={40}
          minFont={32}
          maxHeight={96}
          style={{
            position: "absolute",
            left: 156,
            top: 28,
            fontWeight: 700,
          }}
        />
        <Lines
          value={title}
          width={panel.width - 56}
          maxLines={3}
          maxFont={full ? 48 : 58}
          minFont={full ? 32 : 34}
          maxHeight={full ? 108 : 330}
          style={{
            position: "absolute",
            left: 28,
            top: full ? 140 : 180,
            fontWeight: 700,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 28,
            bottom: 20,
            fontSize: 23,
          }}
        >
          {quantity}
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 28,
            bottom: 22,
            fontSize: 18,
          }}
        >
          via Manifold
        </div>
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
  const palette = previewPalette(identity);
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
