import { storeImporters } from "models/external_import/registry";
import type { NintendoGateway } from "models/external_import/nintendo_strategy";

export type { NintendoGateway } from "models/external_import/nintendo_strategy";

export async function importGame({
  userId,
  eshopUrl,
  isAdmin,
  gateway,
}: {
  userId: string;
  eshopUrl: string;
  isAdmin?: boolean;
  gateway?: NintendoGateway;
}) {
  return storeImporters.nintendo(gateway)({ userId, input: eshopUrl, isAdmin });
}

const nintendoImport = { importGame };
export default nintendoImport;
