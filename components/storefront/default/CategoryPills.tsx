import Link from "next/link";
import { useI18n } from "lib/i18n";

/**
 * The category rail. Plain links rather than click handlers so a pill is
 * middle-clickable and crawlable, and so the filter still works without JS.
 */
export function CategoryPills({
  active,
  categories,
  browseHref,
}: {
  active: string | null;
  categories: readonly string[];
  browseHref: (patch: { category: string | null }) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="w-full flex items-center gap-3 overflow-x-auto pb-4 pt-4 no-scrollbar px-6 md:px-0">
      {categories.map((cat) => (
        <Link
          href={browseHref({ category: cat === "For You" ? null : cat })}
          key={cat}
          data-storefront="filter-option"
          className={`shrink-0 px-6 py-3.5 md:py-4 md:px-8 rounded-2xl font-bold transition-all duration-300 min-h-[44px] text-sm md:text-lg inline-flex items-center justify-center ${
            (!active && cat === "For You") || active === cat
              ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)] motion-safe:transform motion-safe:scale-105"
              : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          {t(cat)}
        </Link>
      ))}
    </div>
  );
}
