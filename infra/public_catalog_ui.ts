import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import {
  CATALOG_IMAGE_ORIGINS,
  CATALOG_VIDEO_ORIGINS,
} from "lib/public-catalog-media";

export const CATALOG_CARD_URI = "ui://manifold/game-card/v3.html";
export const catalogCardToolMeta = {
  ui: { resourceUri: CATALOG_CARD_URI },
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
