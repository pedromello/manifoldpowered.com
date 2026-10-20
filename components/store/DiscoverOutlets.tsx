import Link from "next/link";
import { useI18n } from "lib/i18n";
import { itemHref } from "lib/store-context";
import type { HomeCommunity } from "contracts/home-editorial";
import { FollowOutletButton } from "components/store/FollowOutletButton";
import { EditorialImage } from "components/storefront/default/SelectionCarousel";

export function DiscoverOutlets({
  outlets = [],
}: {
  outlets?: HomeCommunity[];
}) {
  const { t } = useI18n();
  if (!outlets.length) return null;
  return (
    <section
      className="mx-auto max-w-[1500px] py-10 text-white sm:py-12"
      aria-label={t("Find your next community")}
    >
      <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">
        {t("Communities on Manifold")}
      </p>
      <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
        {t("Find your next community")}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
        {t(
          "Different tastes, shared discoveries. Find the people behind your next game.",
        )}
      </p>
      <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {outlets.slice(0, 12).map((outlet) => (
          <article
            key={outlet.id}
            className="min-w-0 flex-[0_0_86%] snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#15101e] md:basis-[calc((100%-2rem)/3)]"
          >
            <Link
              href={`/store/${outlet.slug}`}
              aria-label={outlet.name}
              className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
            >
              <EditorialImage
                src={outlet.cover_url || outlet.games[0]?.media?.banner}
                className="aspect-[2.8]"
              />
            </Link>
            <div className="p-5">
              <Link
                href={`/store/${outlet.slug}`}
                className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
              >
                <EditorialImage
                  src={outlet.logo_url}
                  className="h-12 w-12 shrink-0 rounded-xl"
                />
                <h3 className="min-w-0 break-words text-lg font-bold">
                  {outlet.name}
                </h3>
              </Link>
              <p className="mt-4 min-h-12 line-clamp-2 text-sm leading-6 text-white/60">
                {outlet.description ||
                  t("Discover this community's published picks.")}
              </p>
              {outlet.games.length > 0 && (
                <div className="mt-5 flex flex-col gap-2">
                  {outlet.games.slice(0, 3).map((game) => (
                    <Link
                      key={game.id}
                      href={itemHref(game.slug, outlet.slug)}
                      data-storefront="game-link"
                      className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
                    >
                      <EditorialImage
                        src={game.media?.banner}
                        className="aspect-[1.6] w-16 shrink-0 rounded-lg"
                      />
                      <span className="line-clamp-2 text-xs leading-5 text-white/75">
                        {game.title}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <Link
                  href={`/store/${outlet.slug}`}
                  className="inline-flex min-h-11 items-center text-xs font-bold text-violet-200"
                >
                  {t("Explore community")}
                </Link>
                <FollowOutletButton
                  storeSlug={outlet.slug}
                  storeName={outlet.name}
                  variant="platform"
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
