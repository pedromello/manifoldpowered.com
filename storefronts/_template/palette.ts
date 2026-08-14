import type { StorefrontPalette } from "components/storefront/palette";

/**
 * Copy this directory to `storefronts/<slug>/`, rename the exports, and change
 * these seven values first — they recolour the page background, the PWA status
 * bar, and every shared component the theme reuses.
 */
export const templatePalette: StorefrontPalette = {
  bg: "#0b0f1a",
  surface: "rgba(255, 255, 255, 0.05)",
  border: "rgba(255, 255, 255, 0.10)",
  fg: "#ffffff",
  muted: "rgba(255, 255, 255, 0.60)",
  accent: "#5eead4",
  accentFg: "#04201c",
};
