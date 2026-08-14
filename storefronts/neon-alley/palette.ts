import type { StorefrontPalette } from "components/storefront/palette";

/**
 * Near-black with electric cyan, deliberately nothing like Manifold's indigo.
 * The accent carries prices and the active filter state; `accentFg` is dark so
 * text stays readable on top of it.
 */
export const neonAlleyPalette: StorefrontPalette = {
  bg: "#05060a",
  surface: "rgba(34, 211, 238, 0.06)",
  border: "rgba(34, 211, 238, 0.22)",
  fg: "#e8fdff",
  muted: "rgba(232, 253, 255, 0.55)",
  accent: "#22d3ee",
  accentFg: "#04141a",
};
