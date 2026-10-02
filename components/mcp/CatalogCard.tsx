import { useState } from "react";
import type {
  CatalogGame,
  CatalogReviewsResult,
} from "contracts/public-game-catalog";

export const labels = {
  "pt-BR": {
    details: "Ver detalhes",
    back: "Voltar aos jogos",
    empty: "Nenhum jogo encontrado.",
    description: "Descrição não disponível no catálogo.",
    media: "Mídia não disponível no catálogo.",
    reviews: "Avaliações da comunidade",
    none: "Sem avaliações no catálogo.",
    read: "Ler avaliações",
    all: "Todas",
    positive: "Recomendam",
    negative: "Não recomendam",
    next: "Próxima página",
    previous: "Página anterior",
    video: "Assistir vídeo do catálogo",
    fallback: "Se o vídeo não reproduzir aqui, abra o link.",
    gallery: "Imagem do catálogo",
    imageError: "Não foi possível carregar esta imagem aqui.",
    order: "Ordem",
    filter: "Filtro",
    total: "avaliações no catálogo",
    sample: "comentários nesta página",
    filtered: "no filtro",
    noComments: "Nenhum comentário neste filtro.",
    error: "Não foi possível carregar. Tente novamente.",
    loading: "Carregando…",
    newest: "Mais recentes",
    oldest: "Mais antigas",
    source: "Contadores do catálogo; comentários consultados separadamente.",
  },
  en: {
    details: "View details",
    back: "Back to games",
    empty: "No games found.",
    description: "Description unavailable in the catalog.",
    media: "Media unavailable in the catalog.",
    reviews: "Community reviews",
    none: "No catalog reviews.",
    read: "Read reviews",
    all: "All",
    positive: "Recommend",
    negative: "Do not recommend",
    next: "Next page",
    previous: "Previous page",
    video: "Watch catalog video",
    fallback: "If the video cannot play here, open the link.",
    gallery: "Catalog image",
    imageError: "This image could not load here.",
    order: "Order",
    filter: "Filter",
    total: "catalog reviews",
    sample: "comments on this page",
    filtered: "matching the filter",
    noComments: "No comments match this filter.",
    error: "Could not load. Please try again.",
    loading: "Loading…",
    newest: "Newest",
    oldest: "Oldest",
    source: "Catalog counters; comments consulted separately.",
  },
};
export type CardLocale = keyof typeof labels;
export type ReviewFilter = "all" | "positive" | "negative";
export type ReviewSort = "newest" | "oldest";

function CatalogVideo({
  url,
  title,
  poster,
}: {
  url: string;
  title: string;
  poster?: string;
}) {
  const hls = new URL(url).pathname.endsWith(".m3u8");
  const [playable, setPlayable] = useState(
    () =>
      !hls ||
      (typeof document !== "undefined" &&
        Boolean(
          document
            .createElement("video")
            .canPlayType("application/vnd.apple.mpegurl"),
        )),
  );
  if (!playable) return null;
  return (
    <video
      controls
      playsInline
      preload="none"
      poster={poster}
      src={url}
      aria-label={title}
      onError={() => setPlayable(false)}
    />
  );
}

function GameMedia({
  game,
  locale,
  openLink,
}: {
  game: CatalogGame;
  locale: CardLocale;
  openLink: (url: string) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [link, setLink] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set(),
  );
  const t = labels[locale];
  function imageFailed(url: string) {
    setFailedImages((previous) => new Set([...previous, url]));
  }
  async function open(url: string) {
    try {
      await openLink(url);
    } catch {
      setLink(url);
    }
  }
  return (
    <section className="game-media" aria-label={t.gallery}>
      {game.media.images.length > 0 ? (
        <>
          {failedImages.has(game.media.images[index]) ? (
            <p className="media-unavailable muted">{t.imageError}</p>
          ) : (
            // Catalog images are already projected against the resource CSP.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="hero-image"
              src={game.media.images[index]}
              alt={`${game.title} — ${t.gallery} ${index + 1}`}
              onError={() => imageFailed(game.media.images[index])}
            />
          )}
          {game.media.images.length > 1 && (
            <div className="thumbnails">
              {game.media.images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  aria-label={`${t.gallery} ${i + 1}`}
                  aria-pressed={index === i}
                  onClick={() => setIndex(i)}
                >
                  {failedImages.has(url) ? (
                    <span>{i + 1}</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      onError={() => imageFailed(url)}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted">{t.media}</p>
      )}
      {game.media.videos.map((video, i) => (
        <div className="catalog-video" key={video.url}>
          {video.kind === "file" && (
            <CatalogVideo
              url={video.url}
              poster={game.media.images[0]}
              title={`${game.title} — ${t.video} ${i + 1}`}
            />
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => open(video.url)}
          >
            {t.video}
            {game.media.videos.length > 1 ? ` ${i + 1}` : ""} ↗
          </button>
          {video.kind === "file" && <p className="muted fine">{t.fallback}</p>}
        </div>
      ))}
      {link && (
        <input
          aria-label={t.video}
          value={link}
          readOnly
          onFocus={(event) => event.target.select()}
        />
      )}
    </section>
  );
}

export function CatalogCard({
  game,
  locale,
  reviews,
  pending,
  error,
  loadReviews,
  openLink,
}: {
  game: CatalogGame;
  locale: CardLocale;
  reviews?: CatalogReviewsResult | null;
  pending?: boolean;
  error?: string | null;
  loadReviews: (page: number, filter: ReviewFilter, sort: ReviewSort) => void;
  openLink: (url: string) => Promise<void>;
}) {
  const t = labels[locale];
  const summary = game.review_summary;
  const filter = reviews?.sample.recommendation ?? "all";
  const sort = reviews?.sample.sort ?? "newest";
  return (
    <article className="game-detail">
      <div className="tags">
        {game.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <h1>{game.title}</h1>
      <p className="description">{game.description || t.description}</p>
      <GameMedia
        key={game.slug}
        game={game}
        locale={locale}
        openLink={openLink}
      />
      <section className="reviews" aria-label={t.reviews}>
        <h2>{t.reviews}</h2>
        {summary.total ? (
          <p>
            <strong className="recommendation">
              {Math.round((summary.positive / summary.total) * 100)}%
            </strong>{" "}
            {t.positive.toLowerCase()} · {summary.total} {t.total}
          </p>
        ) : (
          <p className="muted">{t.none}</p>
        )}
        <p className="muted fine">{t.source}</p>
        <div className="review-controls">
          <label>
            {t.filter}
            <select
              aria-label={t.reviews}
              disabled={pending}
              value={filter}
              onChange={(event) =>
                loadReviews(1, event.target.value as ReviewFilter, sort)
              }
            >
              <option value="all">{t.all}</option>
              <option value="positive">{t.positive}</option>
              <option value="negative">{t.negative}</option>
            </select>
          </label>
          <label>
            {t.order}
            <select
              aria-label={
                locale === "en" ? "Review order" : "Ordem das avaliações"
              }
              disabled={pending}
              value={sort}
              onChange={(event) =>
                loadReviews(1, filter, event.target.value as ReviewSort)
              }
            >
              <option value="newest">{t.newest}</option>
              <option value="oldest">{t.oldest}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => loadReviews(1, filter, sort)}
          >
            {pending ? t.loading : t.read}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {reviews && (
          <>
            <p className="muted fine">
              {reviews.sample.returned} {t.sample} · {reviews.pagination.total}{" "}
              {t.filtered}
            </p>
            {reviews.reviews.length === 0 && <p>{t.noComments}</p>}
            {reviews.reviews.map((review) => (
              <blockquote key={review.reference}>
                <strong
                  className={review.recommended ? "recommendation" : "negative"}
                >
                  {review.recommended ? t.positive : t.negative}
                </strong>
                <p>{review.message}</p>
                <footer>
                  <time dateTime={review.created_at}>
                    {new Date(review.created_at).toLocaleDateString(locale)}
                  </time>{" "}
                  · <span className="review-reference">{review.reference}</span>
                </footer>
              </blockquote>
            ))}
            {reviews.pagination.pages > 1 && (
              <nav aria-label={t.reviews} className="pagination">
                <button
                  type="button"
                  disabled={pending || reviews.pagination.page <= 1}
                  onClick={() =>
                    loadReviews(reviews.pagination.page - 1, filter, sort)
                  }
                >
                  {t.previous}
                </button>
                <span>
                  {reviews.pagination.page}/{reviews.pagination.pages}
                </span>
                <button
                  type="button"
                  disabled={
                    pending ||
                    reviews.pagination.page >= reviews.pagination.pages
                  }
                  onClick={() =>
                    loadReviews(reviews.pagination.page + 1, filter, sort)
                  }
                >
                  {t.next}
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </article>
  );
}

export function CatalogSearchCards({
  games,
  locale,
  selectGame,
  pending,
}: {
  games: CatalogGame[];
  locale: CardLocale;
  pending?: boolean;
  selectGame: (slug: string) => void;
}) {
  const t = labels[locale];
  if (!games.length) return <p>{t.empty}</p>;
  return (
    <div className="search-cards">
      {games.map((game) => (
        <article key={game.slug}>
          {game.media.images[0] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={game.media.images[0]} alt={game.title} loading="lazy" />
          )}
          <h2>{game.title}</h2>
          <p>{game.description || t.description}</p>
          <div className="tags">
            {game.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => selectGame(game.slug)}
          >
            {t.details}
          </button>
        </article>
      ))}
    </div>
  );
}
