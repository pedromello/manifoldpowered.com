import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import type { GameApi } from "components/store/types";
import {
  STORE_SOCIAL_PLATFORMS,
  type StoreSocialPlatform,
} from "contracts/store-presentation";
import {
  OUTLET_SHAPE_CLASSES,
  OUTLET_TYPOGRAPHY_CLASSES,
  resolveOutletDesign,
  type ResolvedOutletDesign,
} from "components/storefront/presets/config";
import type {
  StoreContext,
  StorefrontViewProps,
} from "components/storefront/types";
import {
  formatCatalogBasePrice,
  formatCatalogPrice,
  isCatalogFree,
} from "lib/price";
import { useI18n } from "lib/i18n";

type PresetLayoutProps = StorefrontViewProps & {
  design: ResolvedOutletDesign;
};

type VisualTokens = {
  body: string;
  heading: string;
  eyebrow: string;
  card: string;
  control: string;
  media: string;
};

function visualTokens(design: ResolvedOutletDesign): VisualTokens {
  return {
    ...OUTLET_TYPOGRAPHY_CLASSES[design.tokens.typography],
    ...OUTLET_SHAPE_CLASSES[design.tokens.shape],
  };
}

function safeExternalUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const SOCIAL_LABELS: Record<StoreSocialPlatform, string> = {
  website: "Website",
  youtube: "YouTube",
  twitch: "Twitch",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  discord: "Discord",
  bluesky: "Bluesky",
};

function SocialLinks({
  store,
  tokens,
  align = "start",
}: {
  store: StoreContext;
  tokens: VisualTokens;
  align?: "start" | "center";
}) {
  const { t } = useI18n();
  const links = STORE_SOCIAL_PLATFORMS.flatMap((platform) => {
    const label = SOCIAL_LABELS[platform];
    const href = safeExternalUrl(store.social_links?.[platform]);
    return href ? [{ href, label }] : [];
  });

  if (links.length === 0) return null;

  return (
    <nav
      aria-label={t("Outlet links")}
      className={`flex flex-wrap gap-2 ${align === "center" ? "justify-center" : "justify-start"}`}
    >
      {links.map(({ href, label }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("{label} (opens in a new tab)", {
            label: t(label),
          })}
          className={`${tokens.control} border border-sf-border bg-sf-surface px-3 py-1.5 text-xs font-bold text-sf-muted transition hover:border-sf-accent hover:text-sf-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent motion-reduce:transition-none`}
        >
          {t(label)}
        </a>
      ))}
    </nav>
  );
}

function OutletLogo({
  store,
  tokens,
  size = "large",
}: {
  store: StoreContext;
  tokens: VisualTokens;
  size?: "small" | "large";
}) {
  const { t } = useI18n();
  const dimension =
    size === "large" ? "h-24 w-24 sm:h-28 sm:w-28" : "h-16 w-16";
  const logoUrl = safeExternalUrl(store.logo_url ?? undefined);
  if (logoUrl) {
    return (
      // Outlet logos are validated URLs but are not restricted to Next's image hosts.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={t("{name} logo", { name: store.name })}
        referrerPolicy="no-referrer"
        decoding="async"
        className={`${dimension} ${tokens.media} shrink-0 border-4 border-sf-bg bg-sf-surface object-cover shadow-2xl`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dimension} ${tokens.media} flex shrink-0 items-center justify-center border-4 border-sf-bg bg-sf-accent text-3xl font-black uppercase text-sf-accent-fg shadow-2xl`}
    >
      {store.name.slice(0, 1)}
    </div>
  );
}

function OutletCover({
  store,
  className,
}: {
  store: StoreContext;
  className: string;
}) {
  const coverUrl = safeExternalUrl(store.cover_url ?? undefined);
  return (
    <div className={`relative overflow-hidden bg-sf-surface ${className}`}>
      {coverUrl ? (
        // Outlet covers share the same URL validation as logos.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-sf-accent/35 via-sf-surface to-sf-bg" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-sf-bg/85 via-transparent to-black/10" />
    </div>
  );
}

function GameArtwork({
  game,
  className,
}: {
  game: GameApi;
  className?: string;
}) {
  const artworkUrl = safeExternalUrl(game.media?.banner);
  return (
    <div
      className={`relative overflow-hidden bg-sf-surface ${className ?? ""}`}
    >
      {artworkUrl ? (
        // Game media can be served by developer-controlled CDNs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artworkUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:transform-none"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-sf-accent/25 to-sf-bg text-sf-muted">
          <Gamepad2 size={32} aria-hidden="true" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
    </div>
  );
}

function GamePrice({ game }: { game: GameApi }) {
  const { t } = useI18n();
  const basePrice = formatCatalogBasePrice(game);
  return (
    <span className="flex shrink-0 flex-col items-end text-right">
      {basePrice && (
        <span className="text-[10px] font-bold text-sf-muted line-through">
          {basePrice}
        </span>
      )}
      <span className="text-sm font-black text-sf-fg">
        {isCatalogFree(game) ? t("Free") : formatCatalogPrice(game)}
      </span>
    </span>
  );
}

function featuredLabel(
  mode: StorefrontViewProps["featuredMode"],
  t: (message: string) => string,
) {
  if (mode === "EDITORIAL") return t("Selected by this Outlet");
  if (mode === "HYBRID") return t("Curated and trending");
  return t("Trending in this Outlet");
}

function SearchAndFilters({
  props,
  tokens,
  direction,
}: {
  props: StorefrontViewProps;
  tokens: VisualTokens;
  direction: "stack" | "row" | "cluster";
}) {
  const { t } = useI18n();
  const {
    q,
    setQuery,
    activeCategory,
    setCategory,
    tags,
    toggleTag,
    order,
    setOrder,
    categories,
    browseHref,
    searchAction,
    searchHiddenFields,
  } = props;
  const row = direction === "row";

  return (
    <div
      data-storefront="filters"
      className={`${tokens.body} ${row ? "grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)_190px] lg:items-center" : "space-y-5"}`}
    >
      <Form
        action={searchAction}
        onSubmit={(event) => {
          const value = new FormData(event.currentTarget).get("q");
          if (typeof value === "string" && value !== q) {
            event.preventDefault();
            setQuery(value);
          }
        }}
        className="relative"
      >
        <Search
          size={17}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sf-muted"
        />
        <input
          type="search"
          name="q"
          data-storefront="search"
          aria-label={t("Search this Outlet")}
          defaultValue={q}
          placeholder={t("Search this Outlet")}
          className={`${tokens.control} h-11 w-full border border-sf-border bg-sf-surface pl-10 pr-4 text-sm font-semibold text-sf-fg outline-none placeholder:text-sf-muted focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20`}
        />
        {activeCategory && (
          <input type="hidden" name="category" value={activeCategory} />
        )}
        {tags.map((tag) => (
          <input key={tag} type="hidden" name="tags" value={tag} />
        ))}
        {order !== "newest" && (
          <input type="hidden" name="order" value={order} />
        )}
        {Object.entries(searchHiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </Form>

      <div className={`flex flex-wrap gap-2 ${row ? "lg:pb-0" : ""}`}>
        {categories.map((label) => {
          const value = label === "For You" ? null : label;
          const active = activeCategory === value;
          return (
            <Link
              key={label}
              href={browseHref({ category: value, page: 1 })}
              data-storefront="filter-option"
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                  setCategory(value);
                }
              }}
              className={`${tokens.control} shrink-0 border px-3.5 py-2 text-xs font-bold transition motion-reduce:transition-none ${
                active
                  ? "border-sf-accent bg-sf-accent text-sf-accent-fg"
                  : "border-sf-border bg-sf-surface text-sf-muted hover:border-sf-accent hover:text-sf-fg"
              }`}
            >
              {t(label)}
            </Link>
          );
        })}
      </div>

      <div className="relative">
        <select
          value={order}
          onChange={(event) =>
            setOrder(event.target.value as StorefrontViewProps["order"])
          }
          aria-label={t("Sort games")}
          className={`${tokens.control} h-11 w-full appearance-none border border-sf-border bg-sf-surface px-4 pr-9 text-sm font-bold text-sf-fg outline-none focus:border-sf-accent focus:ring-2 focus:ring-sf-accent/20`}
        >
          <option value="newest">{t("Newest")}</option>
          <option value="oldest">{t("Oldest")}</option>
          <option value="price_asc">{t("Price: low to high")}</option>
          <option value="price_desc">{t("Price: high to low")}</option>
          <option value="title_asc">{t("Title A–Z")}</option>
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sf-muted"
        />
      </div>

      {tags.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${row ? "lg:col-span-3" : ""}`}>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`${tokens.control} border border-sf-accent/60 bg-sf-accent/10 px-3 py-1.5 text-xs font-bold text-sf-fg hover:bg-sf-accent/20`}
              aria-label={t("Remove {tag} filter", { tag })}
            >
              {tag} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogPagination({
  props,
  tokens,
}: {
  props: StorefrontViewProps;
  tokens: VisualTokens;
}) {
  const { t } = useI18n();
  const { pagination, page, setPage } = props;
  if (!pagination || pagination.pages <= 1) return null;

  return (
    <nav
      aria-label={t("Catalog pages")}
      className="mt-10 flex items-center justify-center gap-3"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => setPage((current) => Math.max(1, current - 1))}
        className={`${tokens.control} inline-flex h-10 items-center gap-2 border border-sf-border bg-sf-surface px-4 text-sm font-bold text-sf-fg disabled:opacity-35`}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        <span className="hidden sm:inline">{t("Previous")}</span>
      </button>
      <span className="text-xs font-bold uppercase tracking-wider text-sf-muted">
        {t("Page {current} of {total}", {
          current: page,
          total: pagination.pages,
        })}
      </span>
      <button
        type="button"
        disabled={page >= pagination.pages}
        onClick={() => setPage((current) => current + 1)}
        className={`${tokens.control} inline-flex h-10 items-center gap-2 border border-sf-border bg-sf-surface px-4 text-sm font-bold text-sf-fg disabled:opacity-35`}
      >
        <span className="hidden sm:inline">{t("Next")}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

function ChannelGameCard({
  game,
  href,
  tokens,
}: {
  game: GameApi;
  href: string;
  tokens: VisualTokens;
}) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      data-storefront="game-link"
      className={`${tokens.card} group min-w-0 overflow-hidden border border-sf-border bg-sf-surface transition hover:-translate-y-0.5 hover:border-sf-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent motion-reduce:transition-none motion-reduce:hover:transform-none`}
    >
      <GameArtwork game={game} className="aspect-[16/9]" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-sf-fg">
              {game.title}
            </h3>
            <p className="mt-1 truncate text-xs font-semibold text-sf-muted">
              {t("By {studio}", { studio: game.developer_name })}
            </p>
          </div>
          <GamePrice game={game} />
        </div>
        {game.outlet_review?.body && (
          <p className="mt-3 line-clamp-2 text-sm leading-5 text-sf-muted">
            {game.outlet_review.body}
          </p>
        )}
        {game.tags?.length > 0 && (
          <p className="mt-4 truncate text-[11px] font-bold uppercase tracking-wider text-sf-muted">
            {game.tags.slice(0, 3).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}

function EditorialGameRow({
  game,
  href,
  tokens,
  index,
}: {
  game: GameApi;
  href: string;
  tokens: VisualTokens;
  index: number;
}) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      data-storefront="game-link"
      className="group grid min-w-0 grid-cols-[34px_100px_minmax(0,1fr)] items-center gap-3 border-t border-sf-border py-4 transition hover:bg-sf-surface/55 motion-reduce:transition-none sm:grid-cols-[54px_190px_minmax(0,1fr)_auto] sm:gap-5 sm:px-4"
    >
      <span className={`${tokens.heading} text-xl text-sf-muted sm:text-3xl`}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <GameArtwork game={game} className={`${tokens.media} aspect-[16/10]`} />
      <div className="min-w-0">
        <p
          className={`${tokens.heading} truncate text-lg text-sf-fg sm:text-2xl`}
        >
          {game.title}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-sf-muted">
          {t("By {studio}", { studio: game.developer_name })}
          {game.tags?.[0] ? ` · ${game.tags[0]}` : ""}
        </p>
        <p className="mt-2 hidden line-clamp-1 text-sm leading-6 text-sf-muted sm:block">
          {game.outlet_review?.body ||
            game.recommendation_reason ||
            game.description}
        </p>
      </div>
      <span className="hidden sm:block">
        <GamePrice game={game} />
      </span>
    </Link>
  );
}

function CommunityGameCard({
  game,
  href,
  tokens,
  index,
}: {
  game: GameApi;
  href: string;
  tokens: VisualTokens;
  index: number;
}) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      data-storefront="game-link"
      className={`${tokens.card} group relative overflow-hidden border border-sf-border bg-sf-bg p-3 transition hover:border-sf-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent motion-reduce:transition-none`}
    >
      <div className="relative">
        <GameArtwork game={game} className={`${tokens.media} aspect-[4/3]`} />
        <span
          className={`${tokens.control} absolute left-2 top-2 bg-sf-accent px-2.5 py-1 text-[10px] font-black text-sf-accent-fg`}
        >
          #{index + 1}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3 px-1 pb-1 pt-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-sf-fg">
            {game.title}
          </h3>
          <p className="mt-1 truncate text-xs font-semibold text-sf-muted">
            {t("By {studio}", { studio: game.developer_name })}
          </p>
        </div>
        <GamePrice game={game} />
      </div>
    </Link>
  );
}

function CatalogResults({
  props,
  tokens,
  preset,
}: {
  props: StorefrontViewProps;
  tokens: VisualTokens;
  preset: ResolvedOutletDesign["preset"];
}) {
  const { t } = useI18n();
  const { games, isLoading, catalogError, retryCatalog, itemHref, browseHref } =
    props;
  const gridClass =
    preset === "channel"
      ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      : preset === "community"
        ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        : "divide-y-0";

  return (
    <section
      data-storefront="game-list"
      aria-busy={isLoading}
      aria-label={t("Games catalog")}
      className={gridClass}
    >
      {catalogError ? (
        <div
          role="alert"
          className={`${tokens.card} col-span-full border border-rose-300/35 bg-rose-300/[0.07] px-6 py-12 text-center`}
        >
          <p className={`${tokens.heading} text-xl text-sf-fg`}>
            {t("The catalog could not be loaded.")}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-sf-muted">
            {t("Check your connection and try again.")}
          </p>
          <button
            type="button"
            onClick={retryCatalog}
            className={`${tokens.control} mt-5 border border-sf-accent bg-sf-accent px-4 py-2 text-sm font-black text-sf-accent-fg`}
          >
            {t("Try again")}
          </button>
        </div>
      ) : isLoading ? (
        Array.from({ length: preset === "editorial" ? 5 : 6 }).map(
          (_, index) => (
            <div
              key={index}
              className={`${tokens.card} ${
                preset === "editorial" ? "h-32 border-t" : "aspect-[1.15]"
              } animate-pulse border border-sf-border bg-sf-surface motion-reduce:animate-none`}
            />
          ),
        )
      ) : games.length > 0 ? (
        games.map((game, index) => {
          const href = itemHref(game.slug);
          if (preset === "editorial") {
            return (
              <EditorialGameRow
                key={game.id}
                game={game}
                href={href}
                tokens={tokens}
                index={index}
              />
            );
          }
          if (preset === "community") {
            return (
              <CommunityGameCard
                key={game.id}
                game={game}
                href={href}
                tokens={tokens}
                index={index}
              />
            );
          }
          return (
            <ChannelGameCard
              key={game.id}
              game={game}
              href={href}
              tokens={tokens}
            />
          );
        })
      ) : (
        <div
          className={`${tokens.card} col-span-full border border-dashed border-sf-border px-6 py-16 text-center`}
        >
          <p className={`${tokens.heading} text-xl text-sf-fg`}>
            {t("No games found.")}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-sf-muted">
            {t("Try another search or clear the active filters.")}
          </p>
          <Link
            href={browseHref({ q: "", category: null, tags: [], page: 1 })}
            className="mt-5 inline-flex text-sm font-black text-sf-accent hover:underline"
          >
            {t("Clear filters")}
          </Link>
        </div>
      )}
    </section>
  );
}

function FeaturedEmpty({
  isLoading,
  hasError,
  onRetry,
  tokens,
}: {
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  tokens: VisualTokens;
}) {
  const { t } = useI18n();
  return (
    <div
      role={hasError ? "alert" : undefined}
      aria-busy={isLoading && !hasError}
      className={`${tokens.card} flex min-h-56 items-center justify-center border border-dashed border-sf-border bg-sf-surface px-8 text-center text-sm font-semibold text-sf-muted ${isLoading && !hasError ? "animate-pulse motion-reduce:animate-none" : ""}`}
    >
      <div>
        <p>
          {hasError
            ? t("Featured games could not be loaded.")
            : isLoading
              ? t("Preparing featured games…")
              : t("This Outlet is preparing its first featured picks.")}
        </p>
        {hasError && (
          <button
            type="button"
            onClick={onRetry}
            className={`${tokens.control} mt-4 border border-sf-accent bg-sf-accent px-4 py-2 text-xs font-black text-sf-accent-fg`}
          >
            {t("Try again")}
          </button>
        )}
      </div>
    </div>
  );
}

function ChannelLayout(props: PresetLayoutProps) {
  const { t } = useI18n();
  const tokens = visualTokens(props.design);
  const { store, followControl, featured, isFeaturedLoading, itemHref } = props;
  const picks = featured.slice(0, 4);
  const lead = picks[0];
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <main
      data-preset-layout="channel"
      className={`${tokens.body} min-h-screen bg-sf-bg pb-20 text-sf-fg`}
    >
      <header className="mx-auto max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-10">
        <OutletCover
          store={store}
          className={`${tokens.card} h-48 border border-sf-border sm:h-72 lg:h-80`}
        />
        <div className="relative -mt-12 flex flex-col gap-5 px-4 sm:-mt-14 sm:flex-row sm:items-end sm:px-8">
          <OutletLogo store={store} tokens={tokens} />
          <div className="min-w-0 flex-1 pb-1">
            <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
              {t("Creator channel")}
            </p>
            <h1
              className={`${tokens.heading} mt-1 break-words text-4xl text-sf-fg sm:text-5xl`}
            >
              {store.name}
            </h1>
            {store.tagline && (
              <p className="mt-2 max-w-3xl text-base font-bold text-sf-fg/80">
                {store.tagline}
              </p>
            )}
          </div>
          <div className="pb-1">{followControl}</div>
        </div>
        <div className="grid gap-5 px-4 pb-8 pt-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p className="max-w-3xl text-sm leading-6 text-sf-muted">
            {store.description ||
              t("Browse games from {name}.", { name: store.name })}
          </p>
          <SocialLinks store={store} tokens={tokens} />
        </div>
      </header>

      <section className="border-y border-sf-border bg-sf-surface/45">
        <div className="mx-auto max-w-[1500px] px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
                {featuredLabel(props.featuredMode, t)}
              </p>
              <h2 className={`${tokens.heading} mt-2 text-3xl text-sf-fg`}>
                {t("Featured games")}
              </h2>
            </div>
            <span className="hidden text-xs font-bold uppercase tracking-wider text-sf-muted sm:block">
              {picks.length} {t("featured")}
            </span>
          </div>
          {!lead ? (
            <FeaturedEmpty
              isLoading={isFeaturedLoading}
              hasError={props.featuredError}
              onRetry={props.retryFeatured}
              tokens={tokens}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(290px,0.75fr)]">
              <Link
                href={itemHref(lead.slug)}
                data-storefront="game-link"
                className={`${tokens.card} group relative min-h-[360px] overflow-hidden border border-sf-border bg-sf-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent`}
              >
                <GameArtwork game={lead} className="absolute inset-0 h-full" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sf-bg via-sf-bg/85 to-transparent p-6 pt-24 sm:p-8 sm:pt-28">
                  <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
                    {t("Channel spotlight")}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-5">
                    <div className="min-w-0">
                      <h3
                        className={`${tokens.heading} text-3xl text-sf-fg sm:text-4xl`}
                      >
                        {lead.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-sf-muted">
                        {lead.outlet_review?.body ||
                          lead.recommendation_reason ||
                          lead.description}
                      </p>
                    </div>
                    <ArrowRight
                      size={24}
                      className="shrink-0 text-sf-accent transition group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:transform-none"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </Link>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {picks.slice(1).map((game) => (
                  <Link
                    key={game.id}
                    href={itemHref(game.slug)}
                    data-storefront="game-link"
                    className={`${tokens.card} group grid min-w-0 grid-cols-[112px_minmax(0,1fr)] items-center gap-3 overflow-hidden border border-sf-border bg-sf-bg p-2 transition hover:border-sf-accent motion-reduce:transition-none sm:block lg:grid`}
                  >
                    <GameArtwork
                      game={game}
                      className={`${tokens.media} aspect-[4/3] sm:aspect-[16/9] lg:aspect-[4/3]`}
                    />
                    <div className="min-w-0 p-1 sm:p-3 lg:p-1">
                      <p className="truncate text-sm font-black text-sf-fg">
                        {game.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-sf-muted">
                        {t("By {studio}", {
                          studio: game.developer_name,
                        })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1500px] gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:py-16">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={`${tokens.control} inline-flex min-h-11 items-center justify-center gap-2 border border-sf-border bg-sf-surface px-4 text-sm font-black text-sf-fg lg:hidden`}
        >
          <SlidersHorizontal size={17} /> {t("Filters and sorting")}
        </button>
        <aside
          className={`${tokens.card} hidden h-fit border border-sf-border bg-sf-surface/60 p-5 lg:sticky lg:top-24 lg:block lg:self-start`}
        >
          <p className={`${tokens.eyebrow} mb-4 text-[10px] text-sf-accent`}>
            {t("Tune your catalog")}
          </p>
          <SearchAndFilters props={props} tokens={tokens} direction="stack" />
        </aside>
        <div className="min-w-0">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className={`${tokens.heading} text-3xl text-sf-fg`}>
                {t("Browse all games")}
              </h2>
              <p className="mt-2 text-sm text-sf-muted">
                {t("Prices shown in {currency}", { currency: props.currency })}
              </p>
            </div>
            <span className="text-xs font-bold text-sf-muted">
              {t("Page {page}", { page: props.page })}
            </span>
          </div>
          <CatalogResults props={props} tokens={tokens} preset="channel" />
          <CatalogPagination props={props} tokens={tokens} />
        </div>
      </section>
      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-filters-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setFiltersOpen(false);
          }}
        >
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-sf-border bg-sf-bg p-5 pb-8 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2
                id="channel-filters-title"
                className={`${tokens.heading} text-2xl text-sf-fg`}
              >
                {t("Filters and sorting")}
              </h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label={t("Close")}
                className={`${tokens.control} border border-sf-border p-2 text-sf-muted`}
              >
                <X size={18} />
              </button>
            </div>
            <SearchAndFilters props={props} tokens={tokens} direction="stack" />
          </div>
        </div>
      )}
    </main>
  );
}

function EditorialLayout(props: PresetLayoutProps) {
  const { t } = useI18n();
  const tokens = visualTokens(props.design);
  const { store, followControl, featured, isFeaturedLoading, itemHref } = props;
  const picks = featured.slice(0, 3);
  const lead = picks[0];

  return (
    <main
      data-preset-layout="editorial"
      className={`${tokens.body} min-h-screen bg-sf-bg pb-20 text-sf-fg`}
    >
      <header className="border-b border-sf-border">
        <div className="mx-auto max-w-[1320px] px-4 py-7 text-center sm:px-8 sm:py-10">
          <div className="flex justify-center">
            <OutletLogo store={store} tokens={tokens} size="small" />
          </div>
          <p className={`${tokens.eyebrow} mt-5 text-[10px] text-sf-accent`}>
            {t("Outlet recommendations")}
          </p>
          <h1
            className={`${tokens.heading} mx-auto mt-2 max-w-5xl break-words text-5xl leading-none text-sf-fg sm:text-7xl`}
          >
            {store.name}
          </h1>
          {store.tagline && (
            <p className="mx-auto mt-4 max-w-3xl text-lg italic leading-7 text-sf-muted sm:text-xl">
              “{store.tagline}”
            </p>
          )}
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {followControl}
            <SocialLinks store={store} tokens={tokens} align="center" />
          </div>
        </div>
      </header>

      {store.cover_url && (
        <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-8">
          <OutletCover
            store={store}
            className={`${tokens.media} aspect-[16/5] border border-sf-border`}
          />
        </div>
      )}

      <section className="mx-auto max-w-[1320px] px-4 py-10 sm:px-8 lg:py-16">
        <div className="mb-7 grid gap-5 border-b border-sf-border pb-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
              {featuredLabel(props.featuredMode, t)}
            </p>
            <h2 className={`${tokens.heading} mt-2 text-4xl text-sf-fg`}>
              {t("The front page")}
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-sf-muted md:text-right">
            {store.description ||
              t("A considered selection from {name}.", { name: store.name })}
          </p>
        </div>

        {!lead ? (
          <FeaturedEmpty
            isLoading={isFeaturedLoading}
            hasError={props.featuredError}
            onRetry={props.retryFeatured}
            tokens={tokens}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.65fr)]">
            <Link
              href={itemHref(lead.slug)}
              data-storefront="game-link"
              className="group grid gap-5 border-b border-sf-border pb-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent sm:grid-cols-[minmax(0,1.2fr)_minmax(250px,0.8fr)] lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6"
            >
              <GameArtwork
                game={lead}
                className={`${tokens.media} aspect-[4/3]`}
              />
              <div className="flex flex-col justify-between py-1">
                <div>
                  <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
                    {t("Cover story")}
                  </p>
                  <h3
                    className={`${tokens.heading} mt-3 text-3xl leading-tight text-sf-fg sm:text-4xl`}
                  >
                    {lead.title}
                  </h3>
                  <p className="mt-4 line-clamp-5 text-sm leading-7 text-sf-muted">
                    {lead.outlet_review?.body ||
                      lead.recommendation_reason ||
                      lead.description}
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-sf-border pt-4">
                  <span className="text-xs font-bold text-sf-muted">
                    {t("By {studio}", { studio: lead.developer_name })}
                  </span>
                  <GamePrice game={lead} />
                </div>
              </div>
            </Link>
            <div className="divide-y divide-sf-border border-y border-sf-border lg:border-y-0">
              {picks.slice(1).map((game, index) => (
                <Link
                  key={game.id}
                  href={itemHref(game.slug)}
                  data-storefront="game-link"
                  className="group grid grid-cols-[100px_minmax(0,1fr)] gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-1"
                >
                  <GameArtwork
                    game={game}
                    className={`${tokens.media} aspect-[16/10]`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`${tokens.eyebrow} text-[9px] text-sf-accent`}
                    >
                      {t("Dispatch {number}", { number: index + 1 })}
                    </p>
                    <h3
                      className={`${tokens.heading} mt-1 line-clamp-2 text-xl text-sf-fg`}
                    >
                      {game.title}
                    </h3>
                    <p className="mt-2 hidden line-clamp-2 text-xs leading-5 text-sf-muted lg:block">
                      {game.outlet_review?.body ||
                        game.recommendation_reason ||
                        game.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="border-y border-sf-border bg-sf-surface/35">
        <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-8">
          <SearchAndFilters props={props} tokens={tokens} direction="row" />
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-4 py-12 sm:px-8 lg:py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
              {t("The index")}
            </p>
            <h2 className={`${tokens.heading} mt-2 text-4xl text-sf-fg`}>
              {t("All recommendations")}
            </h2>
          </div>
          <p className="hidden text-xs font-bold uppercase tracking-wider text-sf-muted sm:block">
            {props.currency} · {t("Page {page}", { page: props.page })}
          </p>
        </div>
        <CatalogResults props={props} tokens={tokens} preset="editorial" />
        <CatalogPagination props={props} tokens={tokens} />
      </section>
    </main>
  );
}

function CommunityLayout(props: PresetLayoutProps) {
  const { t } = useI18n();
  const tokens = visualTokens(props.design);
  const { store, followControl, featured, isFeaturedLoading, itemHref } = props;
  const picks = featured.slice(0, 3);

  return (
    <main
      data-preset-layout="community"
      className={`${tokens.body} min-h-screen bg-sf-bg pb-20 text-sf-fg`}
    >
      <header className="mx-auto max-w-[1380px] px-4 pt-6 sm:px-8 lg:pt-10">
        <OutletCover
          store={store}
          className={`${tokens.card} h-52 border border-sf-border sm:h-72`}
        />
        <div
          className={`${tokens.card} relative mx-3 -mt-10 grid gap-6 border border-sf-border bg-sf-surface p-5 shadow-2xl sm:mx-8 sm:-mt-14 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)_minmax(260px,0.55fr)_auto] lg:items-center`}
        >
          <OutletLogo store={store} tokens={tokens} />
          <div className="min-w-0">
            <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
              {t("Community club")}
            </p>
            <h1
              className={`${tokens.heading} mt-1 break-words text-4xl text-sf-fg`}
            >
              {store.name}
            </h1>
            {store.tagline && (
              <p className="mt-2 text-base font-bold text-sf-fg/80">
                {store.tagline}
              </p>
            )}
          </div>
          <p className="text-sm leading-6 text-sf-muted">
            {store.description ||
              t("A place to discover and celebrate games together.")}
          </p>
          <div>{followControl}</div>
          <div className="lg:col-start-2 lg:col-span-3">
            <SocialLinks store={store} tokens={tokens} />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1380px] px-4 py-12 sm:px-8 lg:py-16">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
              {featuredLabel(props.featuredMode, t)}
            </p>
            <h2 className={`${tokens.heading} mt-2 text-3xl text-sf-fg`}>
              {t("Club picks")}
            </h2>
          </div>
          <p className="text-sm font-semibold text-sf-muted">
            {t("A shelf for discovering games together.")}
          </p>
        </div>
        {picks.length === 0 ? (
          <FeaturedEmpty
            isLoading={isFeaturedLoading}
            hasError={props.featuredError}
            onRetry={props.retryFeatured}
            tokens={tokens}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {picks.map((game, index) => (
              <Link
                key={game.id}
                href={itemHref(game.slug)}
                data-storefront="game-link"
                className={`${tokens.card} group relative min-h-72 overflow-hidden border border-sf-border bg-sf-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent ${
                  index === 0
                    ? "md:-rotate-1"
                    : index === 2
                      ? "md:rotate-1"
                      : ""
                }`}
              >
                <GameArtwork game={game} className="absolute inset-0 h-full" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sf-bg via-sf-bg/90 to-transparent p-5 pt-20">
                  <span
                    className={`${tokens.control} inline-flex bg-sf-accent px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sf-accent-fg`}
                  >
                    {t("Pick #{number}", { number: index + 1 })}
                  </span>
                  <h3 className={`${tokens.heading} mt-3 text-2xl text-sf-fg`}>
                    {game.title}
                  </h3>
                  <p className="mt-1 truncate text-xs font-semibold text-sf-muted">
                    {t("By {studio}", { studio: game.developer_name })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[1380px] px-4 sm:px-8">
        <div
          className={`${tokens.card} border border-sf-border bg-sf-surface p-5 sm:p-8 lg:p-10`}
        >
          <div className="mb-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <p className={`${tokens.eyebrow} text-[10px] text-sf-accent`}>
                {t("Find your next favorite")}
              </p>
              <h2 className={`${tokens.heading} mt-2 text-4xl text-sf-fg`}>
                {t("Community shelf")}
              </h2>
              <p className="mt-2 text-sm text-sf-muted">
                {t("Prices shown in {currency}", { currency: props.currency })}
              </p>
            </div>
            <SearchAndFilters
              props={props}
              tokens={tokens}
              direction="cluster"
            />
          </div>
          <CatalogResults props={props} tokens={tokens} preset="community" />
          <CatalogPagination props={props} tokens={tokens} />
        </div>
      </section>
    </main>
  );
}

/**
 * The owner-configurable storefront surface. Bespoke themes never enter this
 * resolver: the registry selects those before rendering this component, which
 * keeps their private theme keys isolated from owner-writable preset tokens.
 */
export function CreatorPresetStorefront(props: StorefrontViewProps) {
  const design = resolveOutletDesign(props.store);
  if (design.preset === "editorial") {
    return <EditorialLayout {...props} design={design} />;
  }
  if (design.preset === "community") {
    return <CommunityLayout {...props} design={design} />;
  }
  return <ChannelLayout {...props} design={design} />;
}
