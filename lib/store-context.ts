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
export const PREVIEW_QUERY_PARAM = "preview";

/** Link to a game, preserving attribution and working-draft preview context. */
export function itemHref(
  gameSlug: string,
  storeSlug?: string | null,
  isPreview = false,
): string {
  return withStore(`/item/${gameSlug}`, storeSlug, isPreview);
}

/** Append Outlet context to a local path while preserving existing params. */
export function withStore(
  path: string,
  storeSlug?: string | null,
  isPreview = false,
): string {
  if (!storeSlug && !isPreview) return path;

  const url = new URL(path, "http://manifold.local");
  if (storeSlug) url.searchParams.set(STORE_QUERY_PARAM, storeSlug);
  if (isPreview) url.searchParams.set(PREVIEW_QUERY_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
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
