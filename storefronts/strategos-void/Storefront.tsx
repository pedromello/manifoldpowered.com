import Form from "next/form";
import Link from "next/link";
import { PlaySquare, MessageCircle } from "lucide-react";

import type { StorefrontViewProps } from "components/storefront/types";
import { formatPrice, isFree } from "lib/price";

/**
 * Strategos Void — grand strategy / 4X / city-builder channel.
 *
 * A war-room reading rather than a storefront one: a single curated shelf of
 * ten titles instead of an open catalogue, framed like a briefing rather than
 * a shop aisle. The channel's actual Discord/YouTube URLs are not known yet —
 * `SOCIAL_LINKS` below is a placeholder pair to swap in once the creator's
 * handles are confirmed.
 */
const SOCIAL_LINKS = {
  youtube: "https://www.youtube.com/@StrategosVoid",
  discord: "https://discord.gg/strategosvoid",
};

const CURATOR_QUOTE =
  "Eu não jogo pra vencer rápido — jogo pra reescrever a história e ver o mapa dobrar ao meu comando.";

// Internal curation plumbing (see storefronts/registry.ts's tag filter), never
// meant to be shown to a visitor as a filter option.
const CURATION_TAG = "strategos-void-pick";

function GameCard({
  game,
  href,
}: {
  game: StorefrontViewProps["games"][number];
  href: string;
}) {
  const free = isFree(game);

  return (
    <Link
      href={href}
      data-storefront="game-link"
      className="group relative flex flex-col overflow-hidden border border-sf-border bg-sf-surface transition-colors duration-300 hover:border-sf-accent"
    >
      <div
        className="aspect-[3/4] w-full bg-center bg-cover"
        style={{
          backgroundImage: game.media?.banner
            ? `url(${game.media.banner})`
            : "linear-gradient(160deg, #1c2632 0%, #0a0d12 75%)",
        }}
      />
      <div className="flex flex-col gap-1 border-t border-sf-border px-4 py-3">
        <h3 className="text-sm font-bold uppercase leading-tight tracking-wide">
          {game.title}
        </h3>
        <span className="font-black uppercase tracking-wider text-sf-accent">
          {free ? "Free" : formatPrice(game)}
        </span>
      </div>
    </Link>
  );
}

export function StrategosVoidStorefront({
  store,
  featured,
  games,
  isLoading,
  q,
  tags,
  itemHref,
  browseHref,
  searchAction,
}: StorefrontViewProps) {
  const heroGame = featured[0] ?? games[0] ?? null;

  // Filter pills are built from the tags actually present on this outlet's
  // curated games, not a fixed category list — a store of ten grand-strategy
  // titles has no use for "Horror" or "Racing".
  const availableTags = Array.from(
    new Set(games.flatMap((game) => game.tags || [])),
  )
    .filter((tag) => tag.toLowerCase() !== CURATION_TAG)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <main className="w-full pt-[calc(env(safe-area-inset-top)+6rem)]">
      {/* ---- Channel identity ---- */}
      <header className="border-b border-sf-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 md:px-10 md:py-20">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <img
                src="/storefronts/strategos-void/logo.jpg"
                alt=""
                className="h-16 w-16 shrink-0 rounded-full border-2 border-sf-accent object-cover md:h-20 md:w-20"
              />
              <div>
                <h1 className="text-3xl font-black uppercase tracking-[0.15em] text-sf-fg md:text-5xl">
                  {store.name || "Strategos Void"}
                </h1>
                <p className="mt-2 text-xs uppercase tracking-[0.4em] text-sf-accent">
                  Grand Strategy · 4X · City Builders
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={SOCIAL_LINKS.youtube}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 border border-sf-border px-5 py-3 text-xs font-bold uppercase tracking-widest text-sf-fg transition-colors hover:border-sf-accent hover:text-sf-accent"
              >
                <PlaySquare size={16} />
                YouTube
              </a>
              <a
                href={SOCIAL_LINKS.discord}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 bg-sf-accent px-5 py-3 text-xs font-black uppercase tracking-widest text-sf-accent-fg transition-opacity hover:opacity-90"
              >
                <MessageCircle size={16} />
                Discord
              </a>
            </div>
          </div>

          <p className="max-w-2xl text-base text-sf-muted md:text-lg">
            {store.description ||
              "Análises sérias de grand strategy, 4X e city builders — impérios, dinastias e guerras totais, sem simplificar o tabuleiro."}
          </p>
        </div>
      </header>

      {/* ---- Curated showcase ---- */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
        <div className="mb-10 flex flex-col gap-6 border-b border-sf-border pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-xs uppercase tracking-[0.4em] text-sf-accent">
              A seleção do estrategista
            </span>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-tight text-sf-fg md:text-4xl">
              10 jogos, nenhum escolhido à toa
            </h2>
          </div>

          <Form action={searchAction} className="w-full md:w-72">
            <input
              type="text"
              name="q"
              data-storefront="search"
              defaultValue={q}
              placeholder="Buscar na seleção..."
              className="w-full border border-sf-border bg-sf-surface px-5 py-3 text-sf-fg placeholder:text-sf-muted outline-none focus:border-sf-accent"
            />
            {tags.map((tag) => (
              <input key={tag} type="hidden" name="tags" value={tag} />
            ))}
          </Form>
        </div>

        <nav data-storefront="filters" className="mb-10 flex flex-wrap gap-3">
          {availableTags.length > 0 ? (
            <>
              <Link
                href={browseHref({ tags: [], page: 1 })}
                className={`border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                  tags.length === 0
                    ? "border-sf-accent bg-sf-accent text-sf-accent-fg"
                    : "border-sf-border text-sf-muted hover:border-sf-accent hover:text-sf-accent"
                }`}
              >
                Todos
              </Link>
              {availableTags.map((tag) => {
                const isActive = tags.includes(tag);
                const nextTags = isActive
                  ? tags.filter((t) => t !== tag)
                  : [...tags, tag];
                return (
                  <Link
                    key={tag}
                    href={browseHref({ tags: nextTags, page: 1 })}
                    className={`border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                      isActive
                        ? "border-sf-accent bg-sf-accent text-sf-accent-fg"
                        : "border-sf-border text-sf-muted hover:border-sf-accent hover:text-sf-accent"
                    }`}
                  >
                    {tag}
                  </Link>
                );
              })}
            </>
          ) : (
            <span className="text-xs uppercase tracking-widest text-sf-muted">
              Sem tags para filtrar ainda.
            </span>
          )}
        </nav>

        {heroGame && (
          <Link
            href={itemHref(heroGame.slug)}
            data-storefront="game-link"
            className="group mb-10 flex flex-col overflow-hidden border border-sf-border bg-sf-surface md:flex-row"
          >
            <div
              className="aspect-[16/9] w-full bg-center bg-cover md:aspect-auto md:w-1/2"
              style={{
                backgroundImage: heroGame.media?.banner
                  ? `url(${heroGame.media.banner})`
                  : "linear-gradient(160deg, #1c2632 0%, #0a0d12 75%)",
              }}
            />
            <div className="flex flex-1 flex-col justify-center gap-4 p-8 md:p-12">
              <span className="text-xs uppercase tracking-[0.4em] text-sf-accent">
                Escolha da semana
              </span>
              <h3 className="text-2xl font-black uppercase tracking-tight text-sf-fg md:text-4xl">
                {heroGame.title}
              </h3>
              {heroGame.description && (
                <p className="line-clamp-2 max-w-xl text-sf-muted">
                  {heroGame.description}
                </p>
              )}
              <span className="text-xl font-black uppercase tracking-wider text-sf-accent">
                {isFree(heroGame) ? "Free" : formatPrice(heroGame)}
              </span>
            </div>
          </Link>
        )}

        <div
          data-storefront="game-list"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {isLoading ? (
            <p className="col-span-full py-20 text-center font-bold uppercase tracking-widest text-sf-muted">
              Carregando a seleção…
            </p>
          ) : games.length > 0 ? (
            games.map((game) => (
              <GameCard key={game.id} game={game} href={itemHref(game.slug)} />
            ))
          ) : (
            <p className="col-span-full py-20 text-center font-bold uppercase tracking-widest text-sf-muted">
              A prateleira ainda está sendo montada.
            </p>
          )}
        </div>
      </section>

      {/* ---- About the curator ---- */}
      <section className="border-t border-sf-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-16 text-center md:px-10 md:py-24">
          <img
            src="/storefronts/strategos-void/logo.jpg"
            alt="Strategos Void"
            className="h-24 w-24 rounded-full border-2 border-sf-accent object-cover md:h-28 md:w-28"
          />
          <span className="text-xs uppercase tracking-[0.4em] text-sf-accent">
            Sobre o curador
          </span>
          <blockquote className="max-w-2xl text-2xl font-medium leading-relaxed text-sf-fg md:text-3xl">
            &ldquo;{CURATOR_QUOTE}&rdquo;
          </blockquote>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-sf-muted">
            — Strategos Void
          </p>
        </div>
      </section>
    </main>
  );
}
