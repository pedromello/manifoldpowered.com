import { parseNintendoUrl } from "lib/nintendo";
import { extractSteamAppId } from "lib/steam";

/** Browser-safe definitions shared by import forms, refresh buttons and polling. */
export interface ExternalStoreDefinition {
  endpoint: string;
  requestField: string;
  permission: string;
  normalizeReference: (input: string) => string | null;
  input: {
    type: "text" | "url";
    placeholder: string;
  };
  messages: {
    title: string;
    heading: string;
    description: string;
    inputLabel: string;
    invalidReference: string;
    failure: string;
    refresh: string;
    hint?: string;
  };
}

export const externalStores = {
  steam: {
    endpoint: "/api/v1/items/games/steam-import",
    requestField: "steam_app_id",
    permission: "import:steam_game",
    normalizeReference: extractSteamAppId,
    input: {
      type: "text",
      placeholder: "https://store.steampowered.com/app/400/Portal/",
    },
    messages: {
      title: "Import from Steam",
      heading: "Add a game from Steam",
      description:
        "It will join the public catalog as an unclaimed game. Importing it does not give you ownership.",
      inputLabel: "Steam store link or App ID",
      invalidReference:
        "Enter a valid Steam store link (e.g. https://store.steampowered.com/app/400/) or a numeric App ID.",
      failure: "Steam import failed.",
      refresh: "Update from Steam",
    },
  },
  nintendo: {
    endpoint: "/api/v1/items/games/nintendo-import",
    requestField: "eshop_url",
    permission: "import:nintendo_game",
    normalizeReference: (input: string) => parseNintendoUrl(input)?.url ?? null,
    input: {
      type: "url",
      placeholder:
        "https://www.nintendo.com/pt-br/store/products/hollow-knight-switch/",
    },
    messages: {
      title: "Import from Nintendo eShop",
      heading: "Import from Nintendo eShop",
      description:
        "Add Switch and Switch 2 games to the catalog to discover, recommend and review them.",
      inputLabel: "Nintendo eShop product link",
      invalidReference:
        "Copy a Brazilian or US product page link from www.nintendo.com.",
      failure: "Nintendo import failed.",
      refresh: "Update from eShop",
      hint: "Use the link again to update an existing game. Purchases take place on Nintendo eShop.",
    },
  },
} satisfies Record<string, ExternalStoreDefinition>;

export type ExternalStoreProvider = keyof typeof externalStores;

export function getExternalStore(
  provider: ExternalStoreProvider,
): ExternalStoreDefinition {
  return externalStores[provider];
}

export function externalImportStatusUrl(
  provider: ExternalStoreProvider,
  value: string,
  options: { locale?: string; operationId?: string } = {},
) {
  const store = getExternalStore(provider);
  const query = new URLSearchParams();
  if (options.operationId) query.set("operation_id", options.operationId);
  query.set(store.requestField, value);
  if (options.locale) query.set("locale", options.locale);
  return `${store.endpoint}?${query}`;
}
