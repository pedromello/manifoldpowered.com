import type { NextApiRequest } from "next";
import { z } from "zod";
import { createExternalImportController } from "infra/external_import_controller";
import { ValidationError } from "infra/errors";
import nintendoImport from "models/nintendo_import";
import storefrontPricing from "models/storefront_pricing";
import * as nintendoRefresh from "models/nintendo_refresh";
import { parseNintendoUrl, type NintendoCountry } from "lib/nintendo";

const inputSchema = z.object({ eshop_url: z.string().max(2048) }).strict();

type NintendoStatusReference =
  | { operationId: string; country?: NintendoCountry }
  | { slug: string; country: NintendoCountry };

export default createExternalImportController({
  permission: "import:nintendo_game",
  parseInput,
  parseStatus,
  importGame(input, actor) {
    return nintendoImport.importGame({ ...actor, eshopUrl: input.eshop_url });
  },
  status(reference) {
    return "operationId" in reference
      ? nintendoRefresh.status(reference.operationId, reference.country)
      : nintendoRefresh.statusForSlug(reference.slug, reference.country);
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
      action: "Check the Nintendo product link.",
      context: input.error.issues,
    });
  return input.data;
}

function parseStatus(query: NextApiRequest["query"]): NintendoStatusReference {
  if (
    typeof query.operation_id === "string" &&
    z.uuid().safeParse(query.operation_id).success
  )
    return {
      operationId: query.operation_id,
      country:
        typeof query.eshop_url === "string"
          ? parseNintendoUrl(query.eshop_url)?.country
          : undefined,
    };
  const input =
    typeof query.eshop_url === "string"
      ? parseNintendoUrl(query.eshop_url)
      : null;
  if (!input)
    throw new ValidationError({
      message: "Invalid Nintendo update request.",
      action: "Check the operation or product link.",
    });
  return { slug: input.slug, country: input.country };
}
