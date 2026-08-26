/**
 * A storefront's colour identity.
 *
 * Small on purpose. A bespoke outlet is free to write whatever CSS it likes in
 * its own components — the palette exists so the *shared* pieces (the page
 * background, the PWA status bar, GameListItem, DiscountBadge) follow the
 * outlet without every theme having to restyle them.
 */
export type StorefrontPalette = {
  /** Page background. Also drives `<meta name="theme-color">`. */
  bg: string;
  /** Raised panels and cards sitting on `bg`. */
  surface: string;
  /** Hairlines and card outlines. */
  border: string;
  /** Body text. */
  fg: string;
  /** De-emphasised text. */
  muted: string;
  /** Prices, badges, the one colour that should draw the eye. */
  accent: string;
  /** Text placed on top of `accent`. */
  accentFg: string;
};

/** Manifold's own palette — the values every storefront used before theming. */
export const DEFAULT_PALETTE: StorefrontPalette = {
  bg: "#1d0f3b",
  surface: "rgba(255, 255, 255, 0.05)",
  border: "rgba(255, 255, 255, 0.10)",
  fg: "#ffffff",
  muted: "rgba(255, 255, 255, 0.60)",
  accent: "#ffb400",
  accentFg: "#000000",
};

/** The navigation/home palette used by Manifold and every standard Outlet. */
export const PLATFORM_PALETTE: StorefrontPalette = {
  bg: "#0b0812",
  surface: "#14101c",
  border: "rgba(255, 255, 255, 0.10)",
  fg: "#ffffff",
  muted: "rgba(255, 255, 255, 0.55)",
  accent: "#a78bfa",
  accentFg: "#0b0812",
};

/**
 * Renders a palette as the CSS that overrides the `@theme` defaults.
 *
 * Two things here are load-bearing:
 *
 * 1. `:root:root` (specificity 0,2,0) beats the plain `:root` in global.css
 *    (0,1,0) whichever order the two stylesheets land in `<head>`. That order
 *    is not guaranteed between a styled-jsx global block and the imported CSS
 *    chunk, and getting it wrong fails intermittently in production only. The
 *    alternative was `!important` on every rule, which is what this replaces.
 *
 * 2. `--bg-primary` and `--text-primary` are redefined too. global.css already
 *    does `body { background-color: var(--bg-primary) }`, so overriding the
 *    variable reaches the body without a competing `body` rule — which is how
 *    the three `background-color: #1d0f3b !important` blocks go away.
 *
 * Values are authored in-repo, so there is no injection surface today. If a
 * palette ever comes from the database it becomes user input reaching a
 * `<style>` tag and needs a strict hex/oklch validator before it gets here.
 */
export function paletteToCss(palette: StorefrontPalette): string {
  return `:root:root{
--color-sf-bg:${palette.bg};
--color-sf-surface:${palette.surface};
--color-sf-border:${palette.border};
--color-sf-fg:${palette.fg};
--color-sf-muted:${palette.muted};
--color-sf-accent:${palette.accent};
--color-sf-accent-fg:${palette.accentFg};
--bg-primary:${palette.bg};
--text-primary:${palette.fg};
}`;
}
