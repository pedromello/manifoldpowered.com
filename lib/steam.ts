const STEAM_APP_ID_REGEX = /^\d+$/;
const STEAM_STORE_URL_REGEX = /store\.steampowered\.com\/app\/(\d+)/i;

export function extractSteamAppId(input: string): string | null {
  const trimmed = input.trim();

  if (STEAM_APP_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(STEAM_STORE_URL_REGEX);
  return match ? match[1] : null;
}
