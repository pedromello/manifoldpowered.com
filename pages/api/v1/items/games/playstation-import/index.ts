import type { NextApiRequest } from "next";
import { z } from "zod";
import { createExternalImportController } from "infra/external_import_controller";
import { ValidationError } from "infra/errors";
import playstationImport from "models/playstation_import";
import storefrontPricing from "models/storefront_pricing";
import * as playstationRefresh from "models/playstation_refresh";
import { parsePlayStationUrl, type PlayStationCountry } from "lib/playstation";

import { playstationImportRequestSchema as inputSchema } from "contracts/creator-requests";

type PlayStationStatusReference =
  | { operationId: string; country?: PlayStationCountry }
  | { productId: string; country: PlayStationCountry };

export default createExternalImportController({
  permission: "import:playstation_game",
  parseInput,
  parseStatus,
  importGame(input, actor) {
    return playstationImport.importGame({
      ...actor,
      storeUrl: input.store_url,
    });
  },
  status(reference) {
    return "operationId" in reference
      ? playstationRefresh.status(reference.operationId)
      : playstationRefresh.statusForProduct(reference.productId);
  },
  async present(game, req) {
    const context = await storefrontPricing.contextFor("BRL", [game], req);
    return storefrontPricing.filterAndPrice(
      req.context.user,
      [game],
      context,
    )[0];
  },
});

function parseInput(value: unknown) {
  const input = inputSchema.safeParse(value);
  if (!input.success)
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the PlayStation product link.",
      context: input.error.issues,
    });
  return input.data;
}

function parseStatus(
  query: NextApiRequest["query"],
): PlayStationStatusReference {
  if (
    typeof query.operation_id === "string" &&
    z.uuid().safeParse(query.operation_id).success
  )
    return {
      operationId: query.operation_id,
      country:
        typeof query.store_url === "string"
          ? parsePlayStationUrl(query.store_url)?.country
          : undefined,
    };
  const input =
    typeof query.store_url === "string"
      ? parsePlayStationUrl(query.store_url)
      : null;
  if (!input)
    throw new ValidationError({
      message: "Invalid PlayStation update request.",
      action: "Check the operation or product link.",
    });
  return { productId: input.productId, country: input.country };
}
