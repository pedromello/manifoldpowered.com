import type { GameApi } from "components/store/types";
import {
  isGameVisible,
  summarizeCurationImpact,
  visibilitySource,
  type StoreGameOverride,
  type StoreTagFilter,
} from "lib/store-curation";

function game(slug: string, tags: string[]): GameApi {
  return {
    id: `${slug}-id`,
    slug,
    title: slug,
    description: `${slug} description`,
    detailed_description: `${slug} details`,
    launch_date: "2026-08-31T00:00:00.000Z",
    price: "19.90",
    developer_name: "Test Studio",
    tags,
    media: { screenshots: [], videos: [] },
    purchase_mode: "PLATFORM",
    external_offer: null,
  };
}

const filters: StoreTagFilter[] = [
  { id: "filter-horror", tag: "horror", mode: "BLACKLIST" },
];

describe("store curation helpers", () => {
  test("matches backend precedence and tag casing", () => {
    const horror = game("horror-game", ["Horror"]);
    const strategy = game("strategy-game", ["Strategy"]);
    const overrides: StoreGameOverride[] = [
      {
        id: "override-show",
        game_slug: horror.slug,
        visibility: "SHOW",
      },
      {
        id: "override-hide",
        game_slug: strategy.slug,
        visibility: "HIDE",
      },
    ];

    expect(isGameVisible(horror, filters, [])).toBe(false);
    expect(isGameVisible(horror, filters, overrides)).toBe(true);
    expect(isGameVisible(strategy, filters, overrides)).toBe(false);
    expect(visibilitySource(horror, filters, overrides)).toBe("OVERRIDE");
  });

  test("previews a bulk Show action without confusing visual impact and persisted rules", () => {
    const visible = game("visible", ["RPG"]);
    const blacklisted = game("blacklisted", ["Horror"]);
    const forcedHidden = game("forced-hidden", ["RPG"]);
    const overrides: StoreGameOverride[] = [
      {
        id: "override-hide",
        game_slug: forcedHidden.slug,
        visibility: "HIDE",
      },
    ];

    const impact = summarizeCurationImpact(
      [visible, blacklisted, forcedHidden],
      "SHOW",
      filters,
      overrides,
    );

    expect(impact).toMatchObject({
      selectedCount: 3,
      visibilityChangeCount: 2,
      alreadyMatchingCount: 1,
      createCount: 1,
      updateCount: 1,
    });
    expect(
      impact.operations.map(({ game, method, previousOverride }) => ({
        slug: game.slug,
        method,
        previous: previousOverride?.visibility ?? null,
      })),
    ).toEqual([
      { slug: "blacklisted", method: "POST", previous: null },
      { slug: "forced-hidden", method: "PATCH", previous: "HIDE" },
    ]);
  });

  test("previews Hide with PATCH, POST, and a no-op for an identical override", () => {
    const forcedShown = game("forced-shown", ["RPG"]);
    const blacklisted = game("blacklisted", ["Horror"]);
    const forcedHidden = game("forced-hidden", ["RPG"]);
    const overrides: StoreGameOverride[] = [
      {
        id: "override-show",
        game_slug: forcedShown.slug,
        visibility: "SHOW",
      },
      {
        id: "override-hide",
        game_slug: forcedHidden.slug,
        visibility: "HIDE",
      },
    ];

    const impact = summarizeCurationImpact(
      [forcedShown, blacklisted, forcedHidden],
      "HIDE",
      filters,
      overrides,
    );

    expect(impact).toMatchObject({
      selectedCount: 3,
      visibilityChangeCount: 1,
      alreadyMatchingCount: 2,
      createCount: 0,
      updateCount: 1,
    });
    expect(
      impact.operations.map(({ game, method }) => ({
        slug: game.slug,
        method,
      })),
    ).toEqual([{ slug: "forced-shown", method: "PATCH" }]);
  });

  test("keeps whitelist dormant in ALL and applies it in SELECTED", () => {
    const rpg = game("rpg", ["RPG"]);
    const strategy = game("strategy", ["Strategy"]);
    const whitelist: StoreTagFilter[] = [
      { id: "rpg-rule", tag: "rpg", mode: "WHITELIST" },
    ];

    expect(isGameVisible(strategy, whitelist, [], "ALL")).toBe(true);
    expect(isGameVisible(rpg, whitelist, [], "SELECTED")).toBe(true);
    expect(isGameVisible(strategy, whitelist, [], "SELECTED")).toBe(false);
    expect(isGameVisible(strategy, [], [], "SELECTED")).toBe(false);
  });
});
