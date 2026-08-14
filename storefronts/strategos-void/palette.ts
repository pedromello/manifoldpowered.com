import type { StorefrontPalette } from "components/storefront/palette";

/**
 * Drawn from the channel's real logo (public/storefronts/strategos-void/logo.jpg):
 * near-black background, the mark's crimson outline as accent, warm off-white
 * for body text. Keeps the war-room gravity of the layout while matching the
 * actual brand rather than an invented one.
 */
export const strategosVoidPalette: StorefrontPalette = {
  bg: "#0e0e0f",
  surface: "rgba(224, 68, 68, 0.07)",
  border: "rgba(224, 68, 68, 0.24)",
  fg: "#f4f1ec",
  muted: "rgba(244, 241, 236, 0.58)",
  accent: "#e04444",
  accentFg: "#fdf5f2",
};
