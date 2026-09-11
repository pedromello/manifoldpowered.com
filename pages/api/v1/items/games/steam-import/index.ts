import type { NextApiRequest } from "next";
import { z } from "zod";
import { createExternalImportController } from "infra/external_import_controller";
import authorization from "models/authorization";
import steamImport from "models/steam_import";
import { ValidationError } from "infra/errors";
import * as steamRefresh from "models/steam_refresh";

const steamImportRequestSchema = z.object({
  steam_app_id: z
    .string()
    .max(20)
    .regex(/^[1-9]\d*$/, "steam_app_id must be a positive integer string"),
});

type SteamStatusReference = { operationId: string } | { steamAppId: string };

export default createExternalImportController({
  permission: "import:steam_game",
  parseInput,
  parseStatus,
  importGame(input, actor) {
    return steamImport.importGame({ ...actor, steamAppId: input.steam_app_id });
  },
  status(reference) {
    return "operationId" in reference
      ? steamRefresh.status(reference.operationId)
      : steamRefresh.statusForApp(reference.steamAppId);
  },
  present(game, req) {
    return authorization.filterOutput(
      req.context.user,
      "import:steam_game",
      game,
    );
  },
});

function parseInput(value: unknown) {
  const result = steamImportRequestSchema.safeParse(value);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  return result.data;
}

function parseStatus(query: NextApiRequest["query"]): SteamStatusReference {
  if (
    typeof query.operation_id === "string" &&
    z.uuid().safeParse(query.operation_id).success
  )
    return { operationId: query.operation_id };
  const input = steamImportRequestSchema.safeParse(query);
  if (!input.success)
    throw new ValidationError({
      message: "Invalid Steam update request.",
      action: "Check the operation or Steam app ID.",
      context: input.error.issues,
    });
  return { steamAppId: input.data.steam_app_id };
}
