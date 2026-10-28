export type OutletDraftCacheKey = string | readonly [string, "publication-raw"];
export type OutletDraftCacheMutator = (
  key: OutletDraftCacheKey,
) => unknown | Promise<unknown>;

export function outletDraftCacheKeys(storeSlug: string): OutletDraftCacheKey[] {
  const base = `/api/v1/stores/${storeSlug}`;
  return [
    base,
    `${base}?preview=1`,
    `${base}/publication`,
    `${base}/affiliate-links?draft=1`,
    [`${base}/publication`, "publication-raw"],
  ];
}

/**
 * Every creator-side draft mutation can change both the draft revision and
 * publication readiness. Keep these authoritative views in lockstep so tabs
 * never advertise a stale revision or a publish action that the API rejects.
 */
export async function revalidateOutletDraftCaches(
  mutate: OutletDraftCacheMutator,
  storeSlug: string,
): Promise<void> {
  await Promise.allSettled(
    outletDraftCacheKeys(storeSlug).map(async (key) => mutate(key)),
  );
}
