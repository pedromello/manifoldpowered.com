import useSWR from "swr";

import type { GameApi } from "components/store/types";
import { useRouter } from "next/router";
import { withLocale } from "lib/localized-api";

type ListResponse = { games: GameApi[] };

const fetcher = async (url: string): Promise<ListResponse> => {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || `Request failed: ${response.status}`);
  }
  return body;
};

function outletRailUrl(
  storeSlug: string,
  rail: "trending" | "new-releases",
  limit: number,
  locale: "en" | "pt-BR",
  preview: boolean,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (preview) params.set("preview", "1");
  return withLocale(
    `/api/v1/stores/${storeSlug}/${rail}?${params.toString()}`,
    locale,
  );
}

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
  const router = useRouter();
  const locale = router.locale === "pt-BR" ? "pt-BR" : "en";
  const { data, isLoading, error, mutate } = useSWR<ListResponse>(
    outletRailUrl(
      storeSlug,
      "trending",
      limit,
      locale,
      router.query.preview === "1",
    ),
    fetcher,
  );

  return {
    games: data?.games || [],
    isLoading,
    hasError: Boolean(error),
    retry: () => void mutate(),
  };
}

export function useStorefrontNewReleases(storeSlug: string, limit = 8) {
  const router = useRouter();
  const locale = router.locale === "pt-BR" ? "pt-BR" : "en";
  const { data, isLoading, error, mutate } = useSWR<ListResponse>(
    outletRailUrl(
      storeSlug,
      "new-releases",
      limit,
      locale,
      router.query.preview === "1",
    ),
    fetcher,
  );

  return {
    games: data?.games || [],
    isLoading,
    hasError: Boolean(error),
    retry: () => void mutate(),
  };
}
