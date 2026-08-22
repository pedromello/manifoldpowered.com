import { SectionDivider } from "components/store/SectionDivider";
import { DiscoverOutlets } from "components/store/DiscoverOutlets";
import { HeroBento } from "components/storefront/default/HeroBento";
import { CategoryPills } from "components/storefront/default/CategoryPills";
import { StorefrontSearchBox } from "components/storefront/default/StorefrontSearchBox";
import { GameList } from "components/storefront/default/GameList";
import { PlatformStorefrontHome } from "components/storefront/default/PlatformStorefrontHome";
import type { DefaultStorefrontProps } from "components/storefront/types";

export type DefaultStorefrontViewProps = DefaultStorefrontProps;

/**
 * Manifold's own storefront design, and the fallback for any outlet without a
 * bespoke one.
 *
 * It is a view: everything it renders arrives as props from
 * `useStorefrontController`. That is deliberate — it makes this file the
 * reference implementation of the storefront contract, so a custom outlet's
 * component can be read side by side with it.
 */
export function DefaultStorefront(props: DefaultStorefrontViewProps) {
  if (props.showPlatformWelcome) {
    return <PlatformStorefrontHome {...props} />;
  }

  const {
    store,
    featured,
    isFeaturedLoading,
    games,
    isLoading,
    q,
    activeCategory,
    categories,
    itemHref,
    browseHref,
    searchAction,
    heading = "Just Arrived at Manifold",
    showDiscover = false,
  } = props;

  return (
    <>
      <main className="w-full flex flex-col items-center">
        {/* Banner Section with high-contrast background */}
        <section
          className="w-full pt-[calc(env(safe-area-inset-top)+7rem)] lg:pt-[calc(env(safe-area-inset-top)+9rem)] pb-12 overflow-hidden"
          style={{
            background:
              "linear-gradient(to bottom, rgba(165,180,252,0.05) 0%, rgba(53,34,89,0.2) 60%, transparent 100%)",
          }}
        >
          <div className="px-6 md:px-10 w-full flex flex-col items-center gap-12 md:gap-16">
            {isFeaturedLoading ? (
              <div className="flex h-64 items-center justify-center w-full max-w-7xl">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
              </div>
            ) : (
              <HeroBento featured={featured.slice(0, 3)} itemHref={itemHref} />
            )}
          </div>
        </section>

        <SectionDivider />

        {/* Content Section */}
        <div
          id="catalog"
          className="w-full py-12 md:py-24"
          style={{
            background:
              "linear-gradient(to bottom, rgba(165, 180, 252, 0.16) 0%, rgba(53,34,89,0.2) 30%, #1D0F3B 100%)",
          }}
        >
          <div className="max-w-7xl mx-auto flex flex-col gap-8 px-1 md:px-10">
            <div className="flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-5 mb-6">
                <h1 className="text-4xl font-black md:text-6xl text-white drop-shadow-sm max-w-[20ch]">
                  {heading}
                </h1>

                <StorefrontSearchBox
                  action={searchAction}
                  defaultQuery={q}
                  category={activeCategory}
                />
              </div>

              <div data-storefront="filters">
                <CategoryPills
                  active={activeCategory}
                  categories={categories}
                  browseHref={browseHref}
                />
              </div>

              <GameList
                games={games}
                isLoading={isLoading}
                storeSlug={store?.slug}
              />
            </div>
          </div>
        </div>
        {showDiscover && <DiscoverOutlets />}
      </main>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
}
