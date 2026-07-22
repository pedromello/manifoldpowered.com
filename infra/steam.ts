import { ServiceError } from "./errors";

const STEAM_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const REQUEST_TIMEOUT_MS = 8000;

export interface SteamAppDetailsData {
  name: string;
  short_description?: string;
  detailed_description?: string;
  about_the_game?: string;
  is_free?: boolean;
  price_overview?: { currency: string; initial: number; final: number };
  header_image?: string;
  capsule_image?: string;
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
  genres?: { id: string; description: string }[];
  categories?: { id: number; description: string }[];
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  supported_languages?: string;
  website?: string;
  required_age?: number | string;
  release_date?: { coming_soon: boolean; date: string };
}

export interface SteamAppDetailsResult {
  success: boolean;
  data?: SteamAppDetailsData;
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
