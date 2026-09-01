/**
 * Sale attribution rides on a `?store=` query param: a visitor who reaches a
 * game through an outlet must keep that outlet attached to the link, because
 * `POST /api/v1/library` reads `store_slug` from the body the item page builds
 * out of it.
 *
 * Every place that built this string by hand has drifted at least once — the
 * header's search autocomplete dropped it entirely — so the construction lives
 * here and nowhere else.
 */

export const STORE_QUERY_PARAM = "store";

/** Link to a game's detail page, carrying attribution when there is any. */
export function itemHref(
  gameSlug: string,
  storeSlug?: string | null,
  preview = false,
): string {
  return withStore(
    `/item/${gameSlug}${preview ? "?preview=1" : ""}`,
    storeSlug,
  );
}

/** Append `?store=` to a path that has no query string of its own. */
export function withStore(path: string, storeSlug?: string | null): string {
  if (!storeSlug) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${STORE_QUERY_PARAM}=${encodeURIComponent(storeSlug)}`;
}

/**
 * Read the attributed outlet out of a Next.js router query.
 *
 * The value is attacker-controllable, so callers must treat it as cosmetic:
 * resolve it leniently and fall back to the unattributed view rather than
 * erroring. The money path is already safe — `models/library.ts` resolves an
 * unknown slug to no attribution instead of failing the acquisition.
 */
export function storeSlugFromQuery(query: {
  [key: string]: string | string[] | undefined;
}): string | undefined {
  const value = query[STORE_QUERY_PARAM];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
