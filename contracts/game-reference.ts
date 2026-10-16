/** Browser- and CLI-safe normalization of Steam store references. */
export function extractSteamAppId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match ? match[1] : null;
}
