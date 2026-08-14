import { ReactNode } from "react";
import Head from "next/head";

import { StorefrontContractGuard } from "components/storefront/StorefrontContractGuard";
import {
  DEFAULT_PALETTE,
  paletteToCss,
  type StorefrontPalette,
} from "components/storefront/palette";
import type { StoreContext } from "components/storefront/types";

export type StorefrontShellProps = {
  /** Absent on the platform-wide storefront and on unattributed product pages. */
  store: StoreContext | null;
  palette?: StorefrontPalette;
  title: string;
  description: string;
  /** Identifies the theme in contract-guard messages. */
  themeKey?: string;
  /** Skipped on product pages, which are not catalogue surfaces. */
  enforceContract?: boolean;
  hasGames?: boolean;
  children: ReactNode;
};

/**
 * Wraps every storefront surface, default or bespoke.
 *
 * It owns the three things a theme should not have to remember: the document
 * head, the palette, and the functionality contract. A theme author writes
 * layout and nothing else.
 *
 * The palette is emitted here rather than in each theme because it has to be
 * in the server-rendered HTML. Both `/store/[slug]` and `/item/[slug]` resolve
 * their outlet in `getServerSideProps`, so styled-jsx collects this block
 * during SSR and inlines it in `<head>` — the correct colours are in the first
 * byte, with no flash. styled-jsx also tears the block down on navigation, so
 * leaving a themed outlet for a light page restores the default palette.
 */
export function StorefrontShell({
  store,
  palette = DEFAULT_PALETTE,
  title,
  description,
  themeKey = "default",
  enforceContract = false,
  hasGames = false,
  children,
}: StorefrontShellProps) {
  const body = (
    <div className="min-h-screen bg-sf-bg text-sf-fg pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      {children}
    </div>
  );

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {store?.logo_url && (
          <meta property="og:image" content={store.logo_url} />
        )}
        {/* Overrides the global #fffbf6 in _app so the PWA status bar matches
            the outlet rather than the marketing site. */}
        <meta name="theme-color" content={palette.bg} />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        {/*
          Emitted through next/head rather than styled-jsx. styled-jsx treats a
          fully-interpolated block as a dynamic style and does not inline it
          during SSR, which is exactly the flash this design exists to avoid.
          next/head puts it in the served HTML and removes it again when the
          visitor navigates to a page that does not render a shell.
        */}
        <style
          key="storefront-palette"
          dangerouslySetInnerHTML={{ __html: paletteToCss(palette) }}
        />
      </Head>

      {enforceContract && store ? (
        <StorefrontContractGuard
          themeKey={themeKey}
          storeSlug={store.slug}
          hasGames={hasGames}
        >
          {body}
        </StorefrontContractGuard>
      ) : (
        body
      )}
    </>
  );
}
