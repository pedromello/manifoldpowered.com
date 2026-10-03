import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import {
  CATALOG_IMAGE_ORIGINS,
  CATALOG_VIDEO_ORIGINS,
} from "lib/public-catalog-media";

export const CATALOG_CARD_URI = "ui://manifold/game-card/v4.html";
export const catalogCardToolMeta = {
  ui: { resourceUri: CATALOG_CARD_URI, visibility: ["model", "app"] },
  "openai/outputTemplate": CATALOG_CARD_URI,
};

export function readCatalogCard() {
  return {
    contents: [
      {
        uri: CATALOG_CARD_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: readFileSync(
          join(process.cwd(), "public/mcp/game-card.html"),
          "utf8",
        ),
        _meta: {
          "openai/widgetDescription":
            "Manifold presents a final public game selection or a trailer-first game card. Reading comments stays in the card; discussing reviews starts a conversation only after an explicit click. Give a brief grounded follow-up without repeating the card or claiming host expansion.",
          ui: {
            prefersBorder: true,
            csp: {
              resourceDomains: [
                ...new Set([
                  ...CATALOG_IMAGE_ORIGINS,
                  ...CATALOG_VIDEO_ORIGINS,
                ]),
              ],
              connectDomains: [],
              frameDomains: [],
            },
          },
          "openai/ui": {
            availableDisplayModes: ["inline"],
            preferredDisplayMode: "inline",
          },
        },
      },
    ],
  };
}
