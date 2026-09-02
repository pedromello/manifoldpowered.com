export type OutletDraftCacheMutator = (
  key: string,
) => unknown | Promise<unknown>;

export function outletDraftCacheKeys(storeSlug: string): string[] {
  const base = `/api/v1/stores/${storeSlug}`;
  return [base, `${base}?preview=1`, `${base}/publication`];
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
