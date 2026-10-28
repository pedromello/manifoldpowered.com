export function steamPageForGame(socialLinks: unknown): string | null {
  return socialLinks &&
    typeof socialLinks === "object" &&
    !Array.isArray(socialLinks) &&
    "steam_page" in socialLinks &&
    typeof socialLinks.steam_page === "string"
    ? socialLinks.steam_page
    : null;
}

export function purchaseModeForGame(game: {
  nintendo_nsuid: string | null;
  playstation_product_id?: string | null;
  status: string;
  social_links: unknown;
}) {
  return game.playstation_product_id
    ? "PLAYSTATION_ONLY"
    : game.nintendo_nsuid
      ? "NINTENDO_ONLY"
      : game.status === "ACTIVE"
        ? "PLATFORM"
        : steamPageForGame(game.social_links)
          ? "STEAM_ONLY"
          : "UNAVAILABLE";
}
