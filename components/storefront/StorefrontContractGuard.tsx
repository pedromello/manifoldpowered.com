import { ReactNode, useEffect, useRef } from "react";

/**
 * Checks that a storefront theme actually rendered the functionality its props
 * gave it, and complains in the console when it did not.
 *
 * This exists because the compiler cannot do it. `tsconfig.json` sets
 * `strict: false` and `strictNullChecks: false`, and even under strict TS a
 * component can accept `setQuery` and simply never render a search box — the
 * types say the props were *received*, never that they were *used*. Since the
 * repo has no frontend test setup either, a bespoke outlet that quietly ships
 * without search would otherwise reach production unnoticed.
 *
 * Development only: it costs one DOM query after mount and is compiled out of
 * production bundles by the `NODE_ENV` check.
 *
 * The markers it looks for are already in `storefronts/_template/`, so the
 * copy-paste workflow satisfies this by default.
 */
export function StorefrontContractGuard({
  themeKey,
  storeSlug,
  hasGames,
  children,
}: {
  themeKey: string;
  storeSlug: string;
  /** Whether the controller handed the theme any games to render. */
  hasGames: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const root = ref.current;
    if (!root) return;

    const complain = (problem: string) =>
      console.error(
        `[storefront contract] theme "${themeKey}" on /store/${storeSlug}: ${problem}`,
      );

    if (!root.querySelector('[data-storefront="search"]')) {
      complain('no [data-storefront="search"] — visitors cannot search');
    }

    if (!root.querySelector('[data-storefront="filters"]')) {
      complain('no [data-storefront="filters"] — visitors cannot filter');
    }

    if (!root.querySelector('[data-storefront="follow-outlet"]')) {
      complain(
        'no [data-storefront="follow-outlet"] — visitors cannot follow this Outlet',
      );
    }

    const list = root.querySelector('[data-storefront="game-list"]');
    if (!list) {
      complain('no [data-storefront="game-list"] — the catalogue is missing');
      return;
    }

    const links = Array.from(
      list.querySelectorAll<HTMLAnchorElement>('[data-storefront="game-link"]'),
    );

    if (hasGames && links.length === 0) {
      complain("games were supplied but none were rendered as links");
    }

    // The reason attribution silently broke before: a link built by hand
    // instead of through the controller's itemHref loses the outlet, and the
    // sale stops paying out.
    const unattributed = links.filter(
      (link) =>
        !link
          .getAttribute("href")
          ?.includes(`store=${encodeURIComponent(storeSlug)}`),
    );

    if (unattributed.length > 0) {
      complain(
        `${unattributed.length} game link(s) missing ?store=${storeSlug} — ` +
          "those sales will not attribute to this outlet. Use the itemHref prop.",
      );
    }
  }, [themeKey, storeSlug, hasGames, children]);

  return <div ref={ref}>{children}</div>;
}
