import useSWR from "swr";

import type { GameApi } from "components/store/types";

type ListResponse = { games: GameApi[] };

const fetcher = (url: string): Promise<ListResponse> =>
  fetch(url).then((res) => res.json());

/**
 * Optional rails a bespoke storefront can add that the default one does not
 * have.
 *
 * Separate hooks rather than extra props on `StorefrontViewProps` for two
 * reasons: a theme that does not want a trending rail should not pay for the
 * request, and calling a hook at a theme's own top level keeps the rules of
 * hooks obvious.
 *
 * `GET /api/v1/stores/[slug]/trending` and `/new-releases` have existed since
 * the storefront endpoints were written and had no callers at all — the
 * curation and regional pricing pipeline behind them is the same as `/search`,
 * so these are free material.
 */
export function useStorefrontTrending(storeSlug: string, limit = 8) {
  const { data, isLoading } = useSWR<ListResponse>(
    `/api/v1/stores/${storeSlug}/trending?limit=${limit}`,
    fetcher,
  );

  return { games: data?.games || [], isLoading };
}

export function useStorefrontNewReleases(storeSlug: string, limit = 8) {
  const { data, isLoading } = useSWR<ListResponse>(
    `/api/v1/stores/${storeSlug}/new-releases?limit=${limit}`,
    fetcher,
  );

  return { games: data?.games || [], isLoading };
}
