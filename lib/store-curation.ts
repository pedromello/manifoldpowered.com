import type { GameApi } from "components/store/types";

export type CurationVisibility = "SHOW" | "HIDE";
export type CurationAction = CurationVisibility | "PIN_SHOW";
export type CatalogMode = "UNDECIDED" | "ALL" | "SELECTED";

export type StoreTagFilter = {
  id: string;
  tag: string;
  mode: "WHITELIST" | "BLACKLIST";
};

export type StoreGameOverride = {
  id: string;
  game_slug: string;
  visibility: CurationVisibility;
};

export type CurationOperation = {
  game: GameApi;
  method: "POST" | "PATCH";
  target: CurationVisibility;
  previousOverride: StoreGameOverride | null;
};

export type CurationImpact = {
  selectedCount: number;
  visibilityChangeCount: number;
  alreadyMatchingCount: number;
  createCount: number;
  updateCount: number;
  operations: CurationOperation[];
};

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export function overrideForGame(
  gameSlug: string,
  overrides: StoreGameOverride[],
): StoreGameOverride | undefined {
  return overrides.find(
    (override) => normalized(override.game_slug) === normalized(gameSlug),
  );
}

export function isGameVisible(
  game: Pick<GameApi, "slug" | "tags">,
  filters: StoreTagFilter[],
  overrides: StoreGameOverride[],
  catalogMode: CatalogMode = "ALL",
): boolean {
  const override = overrideForGame(game.slug, overrides);
  if (override) return override.visibility === "SHOW";

  const gameTags = new Set((game.tags ?? []).map(normalized));
  const whitelist = filters
    .filter((filter) => filter.mode === "WHITELIST")
    .map((filter) => normalized(filter.tag));
  const blacklist = filters
    .filter((filter) => filter.mode === "BLACKLIST")
    .map((filter) => normalized(filter.tag));

  const isBlacklisted = blacklist.some((tag) => gameTags.has(tag));
  if (isBlacklisted) return false;

  if (catalogMode !== "ALL" && whitelist.length > 0) {
    return whitelist.some((tag) => gameTags.has(tag));
  }
  return catalogMode === "ALL";
}

export function visibilitySource(
  game: Pick<GameApi, "slug" | "tags">,
  filters: StoreTagFilter[],
  overrides: StoreGameOverride[],
): "OVERRIDE" | "TAG_RULE" | "CATALOG" {
  if (overrideForGame(game.slug, overrides)) return "OVERRIDE";
  if (filters.length === 0) return "CATALOG";

  const gameTags = new Set((game.tags ?? []).map(normalized));
  const matchingRule = filters.some((filter) =>
    gameTags.has(normalized(filter.tag)),
  );
  const hasWhitelist = filters.some((filter) => filter.mode === "WHITELIST");

  return matchingRule || hasWhitelist ? "TAG_RULE" : "CATALOG";
}

export function summarizeCurationImpact(
  games: GameApi[],
  action: CurationAction,
  filters: StoreTagFilter[],
  overrides: StoreGameOverride[],
  catalogMode: CatalogMode = "ALL",
): CurationImpact {
  const target = action === "HIDE" ? "HIDE" : "SHOW";
  const targetVisible = target === "SHOW";
  const operations: CurationOperation[] = [];
  let visibilityChangeCount = 0;
  let alreadyMatchingCount = 0;
  let createCount = 0;
  let updateCount = 0;

  for (const game of games) {
    const currentVisible = isGameVisible(game, filters, overrides, catalogMode);
    if (currentVisible === targetVisible) alreadyMatchingCount += 1;
    else visibilityChangeCount += 1;

    const previousOverride = overrideForGame(game.slug, overrides) ?? null;
    const shouldPersist =
      action === "PIN_SHOW"
        ? previousOverride?.visibility !== "SHOW"
        : currentVisible !== targetVisible;
    if (!shouldPersist) continue;

    operations.push({
      game,
      method: previousOverride ? "PATCH" : "POST",
      target,
      previousOverride,
    });
    if (previousOverride) updateCount += 1;
    else createCount += 1;
  }

  return {
    selectedCount: games.length,
    visibilityChangeCount,
    alreadyMatchingCount,
    createCount,
    updateCount,
    operations,
  };
}
