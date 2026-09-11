import {
  nintendoFeatures,
  steamFeatures,
  mergeGameFeatures,
} from "lib/game_features";
import { parseNintendoProduct } from "infra/nintendo";
import { nintendoHtml } from "tests/fixtures/nintendo";
import { nintendoProductUrl } from "lib/nintendo";
import { mapSteamAppToGameData, steamImportedGameSchema } from "models/game";

test("Pokopia numerical counts distinguish local wireless from a single console", () => {
  const product = parseNintendoProduct(
    nintendoHtml("BR", {
      numberOfPlayers: {
        system: { min: 1, max: null, label: "Modo para um jogador" },
        local: { min: 2, max: 4, label: "4+" },
        online: { min: 1, max: 4, label: "4+" },
      },
    }),
    nintendoProductUrl("test-knight-switch", "BR"),
  );
  expect(nintendoFeatures(product.numberOfPlayers)).toEqual({
    single_player: true,
    multiplayer: true,
    players: {
      system: { min: 1, max: null },
      local: { min: 2, max: 4 },
      online: { min: 1, max: 4 },
    },
  });
});
test("missing and malformed optional modes do not reject valid product data or invent features", () => {
  const product = parseNintendoProduct(
    nintendoHtml("BR", {
      numberOfPlayers: {
        system: { min: 1, max: 1 },
        local: null,
        online: { min: 4, max: 2 },
      },
    }),
    nintendoProductUrl("test-knight-switch", "BR"),
  );
  expect(nintendoFeatures(product.numberOfPlayers)).toEqual({
    single_player: true,
    players: { system: { min: 1, max: 1 } },
  });
  expect(nintendoFeatures(undefined)).toEqual({});
  expect(steamFeatures({})).toEqual({});
});
test("Steam uses IDs, preserves parsed features and distinguishes partial controller support", () => {
  const data = mapSteamAppToGameData(
    {
      name: "Portal 2",
      categories: [
        { id: 2, description: "Translated" },
        { id: 38, description: "Translated" },
      ],
      controller_support: "partial",
    },
    "620",
  );
  expect(steamImportedGameSchema.parse(data).meta_tags.features).toEqual({
    single_player: true,
    multiplayer: true,
    controller: "partial",
  });
  expect(steamFeatures({ categories: [{ id: 28 }] })).toEqual({
    controller: "full",
  });
  expect(steamFeatures({ categories: [{ id: 18 }] })).toEqual({
    controller: "partial",
  });
});
test("refreshes merge only confirmed optional facts", () => {
  const previous = {
    features: {
      single_player: true,
      multiplayer: true,
      controller: "full",
      players: { online: { min: 1, max: 4 } },
    },
  };
  expect(mergeGameFeatures(previous, {})).toEqual(previous.features);
});
