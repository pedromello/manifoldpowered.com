import { ServiceError } from "./errors";

const STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const REQUEST_TIMEOUT_MS = 8000;

export interface SteamAppDetailsResult {
  success: boolean;
  data?: unknown;
}

type SteamAppDetailsApiResponse = Record<string, SteamAppDetailsResult>;

export async function fetchAppDetails(
  appId: string,
): Promise<SteamAppDetailsResult> {
  const url = `${STEAM_APPDETAILS_URL}?appids=${encodeURIComponent(appId)}&cc=us&l=en`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ServiceError({
      message: `Failed to reach the Steam API for app id "${appId}".`,
      cause: error,
      action: "Try again later or check Steam's service status.",
    });
  }

  if (!response.ok) {
    throw new ServiceError({
      message: `Steam API responded with status ${response.status} for app id "${appId}".`,
      action: "Try again later or check Steam's service status.",
      context: { status: response.status },
    });
  }

  const body: SteamAppDetailsApiResponse = await response.json();
  return body[appId];
}

const steam = { fetchAppDetails };

export default steam;
