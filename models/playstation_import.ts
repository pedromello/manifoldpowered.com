import { storeImporters } from "models/external_import/registry";
import type { PlayStationGateway } from "models/external_import/playstation_strategy";
export async function importGame({
  userId,
  storeUrl,
  isAdmin,
  gateway,
}: {
  userId: string;
  storeUrl: string;
  isAdmin?: boolean;
  gateway?: PlayStationGateway;
}) {
  return storeImporters.playstation(gateway)({
    userId,
    input: storeUrl,
    isAdmin,
  });
}
const playstationImport = { importGame };
export default playstationImport;
