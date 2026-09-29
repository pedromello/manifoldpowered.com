import { storeImporters } from "models/external_import/registry";
import {
  isAdultOnlySteamGame,
  type SteamDetailsGateway,
} from "models/external_import/steam_strategy";

export type { SteamDetailsGateway } from "models/external_import/steam_strategy";
export { isAdultOnlySteamGame } from "models/external_import/steam_strategy";

async function importGame({
  userId,
  steamAppId,
  isAdmin,
  gateway,
}: {
  userId: string;
  steamAppId: string;
  isAdmin?: boolean;
  gateway?: SteamDetailsGateway;
}) {
  return storeImporters.steam(gateway)({ userId, input: steamAppId, isAdmin });
}

const steamImport = { importGame, isAdultOnlySteamGame };
export default steamImport;
