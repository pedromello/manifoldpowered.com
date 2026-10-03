import { useEffect, useRef, useState } from "react";
import { ChevronRight, Images, MessageSquare } from "lucide-react";
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
    positive: "Recomendam",
    negative: "Não recomendam",
    next: "Próxima página",
    previous: "Página anterior",
    video: "Abrir vídeo do catálogo",
    gallery: "Imagem do catálogo",
    gameplay: "Imagem de gameplay",
    cover: "Capa do catálogo",
    imageError: "Não foi possível carregar esta imagem aqui.",
    total: "avaliações no catálogo",
    sample: "comentários nesta página",
    filtered: "no filtro",
    noComments: "Nenhum comentário neste filtro.",
    error: "Não foi possível carregar. Tente novamente.",
    loading: "Carregando…",
    newest: "Mais recentes",
    oldest: "Mais antigas",
    all: "Todas",
    source: "Contadores do catálogo; comentários consultados separadamente.",
    trailer: "Vídeo do catálogo",
    manual:
      "Use os controles para reproduzir. O autoplay pode ser bloqueado aqui.",
    unavailableVideo:
      "Este vídeo não reproduziu aqui. Você pode abrir o vídeo do catálogo.",
    images: "Ver imagens",
    selection: "Para explorar",
    match: "Combina com suas tags:",
    evidence: "Ver comentários e datas consultados",
    discuss: "Conversar sobre as avaliações",
    conversationError:
      "O host não aceitou enviar à conversa. As avaliações continuam disponíveis abaixo; peça a análise na conversa.",
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
    positive: "Recommend",
    negative: "Do not recommend",
    next: "Next page",
    previous: "Previous page",
    video: "Open catalog video",
    gallery: "Catalog image",
    gameplay: "Gameplay image",
    cover: "Catalog cover",
    imageError: "This image could not load here.",
    total: "catalog reviews",
    sample: "comments on this page",
    filtered: "matching the filter",
    noComments: "No comments match this filter.",
    error: "Could not load. Please try again.",
    loading: "Loading…",
    newest: "Newest",
    oldest: "Oldest",
    all: "All",
    source: "Catalog counters; comments consulted separately.",
    trailer: "Catalog video",
    manual: "Use the controls to play. Autoplay may be blocked here.",
    unavailableVideo:
      "This video could not play here. You can open the catalog video.",
    images: "View images",
    selection: "Games to explore",
    match: "Matches your tags:",
    evidence: "View consulted comments and dates",
    discuss: "Discuss these reviews",
    conversationError:
      "The host did not accept sending to the conversation. Reviews remain available below; ask for analysis in the conversation.",
  },
};
export type CardLocale = keyof typeof labels;
export type ReviewFilter = "all" | "positive" | "negative";
export type ReviewSort = "newest" | "oldest";

function CatalogImage({
  url,
  alt,
  className,
}: {
  url?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || failed)
    return (
      <span
        className={`image-placeholder ${className ?? ""}`}
        role="img"
        aria-label={alt}
      >
        <Images size={24} aria-hidden="true" />
      </span>
    );
  // URLs have passed the public media allowlist and match the resource CSP.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function CatalogVideo({
  url,
  poster,
  title,
  locale,
}: {
  url: string;
  poster?: string;
  title: string;
  locale: CardLocale;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"manual" | "playing" | "unavailable">(
    "manual",
  );
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let active = true;
    video.muted = true;
    // One best-effort attempt per mounted source. The host/browser may refuse it.
    void video.play().catch((error: unknown) => {
      if (active)
        setStatus(
          video.error ||
            (error instanceof DOMException &&
              error.name === "NotSupportedError")
            ? "unavailable"
            : "manual",
        );
    });
    return () => {
      active = false;
      video.pause();
    };
  }, [url]);
  const t = labels[locale];
  return (
    <>
      {status === "unavailable" ? (
        <CatalogImage url={poster} className="hero-image" alt={title} />
      ) : (
        <video
          ref={ref}
          controls
          muted
          playsInline
          preload="metadata"
          poster={poster}
          src={url}
          aria-label={title}
          onPlaying={() => setStatus("playing")}
          onPause={() =>
            setStatus((previous) =>
              previous === "unavailable" ? previous : "manual",
            )
          }
          onError={(event) => {
            event.currentTarget.pause();
            setStatus("unavailable");
          }}
        />
      )}
      {status !== "playing" && (
        <p className="media-status muted" role="status">
          {status === "unavailable" ? t.unavailableVideo : t.manual}
        </p>
      )}
    </>
  );
}

function canPlayVideo(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (!pathname.endsWith(".m3u8")) return true;
  return (
    typeof document !== "undefined" &&
    Boolean(
      document
        .createElement("video")
        .canPlayType("application/vnd.apple.mpegurl"),
    )
  );
}
function GameTrailer({
  game,
  locale,
  openLink,
}: {
  game: CatalogGame;
  locale: CardLocale;
  openLink: (url: string) => Promise<void>;
}) {
  const t = labels[locale];
  const video =
    game.media.videos.find(
      (item) => item.kind === "file" && canPlayVideo(item.url),
    ) ?? game.media.videos[0];
  const image =
    game.media.screenshots?.[0] ?? game.media.cover ?? game.media.images[0];
  const [linkError, setLinkError] = useState(false);
  const playable = video?.kind === "file" && canPlayVideo(video.url);
  return (
    <section
      className="game-trailer"
      aria-label={video ? t.trailer : t.gallery}
    >
      {playable ? (
        <CatalogVideo
          key={video.url}
          url={video.url}
          poster={image}
          title={`${game.title} — ${t.trailer}`}
          locale={locale}
        />
      ) : image ? (
        <CatalogImage
          key={image}
          url={image}
          className="hero-image"
          alt={`${game.title} — ${game.media.screenshots?.includes(image) ? t.gameplay : t.cover}`}
        />
      ) : (
        <p className="media-unavailable muted">{t.media}</p>
      )}
      {video && (
        <div className="video-link">
          {!playable && <p className="muted fine">{t.unavailableVideo}</p>}
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={async (event) => {
              event.preventDefault();
              try {
                await openLink(video.url);
              } catch {
                setLinkError(true);
              }
            }}
          >
            {t.video} ↗
          </a>
          {linkError && (
            <a href={video.url} target="_blank" rel="noopener noreferrer">
              {video.url}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
function ReviewSummary({
  game,
  locale,
}: {
  game: CatalogGame;
  locale: CardLocale;
}) {
  const t = labels[locale];
  const summary = game.review_summary;
  return summary.total ? (
    <p className="review-summary" title={t.source}>
      <strong>
        {Math.round((summary.positive / summary.total) * 100)}%{" "}
        {t.positive.toLowerCase()}
      </strong>
      <span>
        {" "}
        · {summary.total} {t.total}
      </span>
    </p>
  ) : (
    <p className="muted fine">{t.none}</p>
  );
}

export function CatalogCard({
  game,
  locale,
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
  const [showImages, setShowImages] = useState(false);
  const screenshots = game.media.screenshots ?? [];
  return (
    <article className="game-detail">
      <GameTrailer
        key={game.slug}
        game={game}
        locale={locale}
        openLink={openLink}
      />
      <div className="detail-copy">
        <h1>{game.title}</h1>
        <p className="tags">{game.tags.slice(0, 4).join(" · ")}</p>
        <p className="description">{game.description || t.description}</p>
        <ReviewSummary game={game} locale={locale} />
        <div className="detail-actions">
          {screenshots.length > 0 && (
            <button
              type="button"
              aria-expanded={showImages}
              onClick={() => setShowImages(!showImages)}
            >
              <Images size={16} aria-hidden="true" />
              {t.images}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => loadReviews(1, "all", "newest")}
          >
            <MessageSquare size={16} aria-hidden="true" />
            {pending ? t.loading : t.read}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {showImages && (
          <div className="game-screenshots">
            {screenshots.map((url, i) => (
              <CatalogImage
                key={url}
                url={url}
                className="hero-image"
                alt={`${game.title} — ${t.gameplay} ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function CatalogReviewEvidence({
  reviews,
  locale,
  pending,
  error,
  loadReviews,
  discuss,
}: {
  reviews: CatalogReviewsResult;
  locale: CardLocale;
  pending: boolean;
  error: string | null;
  loadReviews: (page: number, filter: ReviewFilter, sort: ReviewSort) => void;
  discuss: () => void;
}) {
  const t = labels[locale];
  const { game, sample, pagination } = reviews;
  return (
    <section className="review-evidence" aria-label={t.reviews}>
      <div className="review-scope">
        <CatalogImage
          key={game.slug}
          url={game.media.cover ?? game.media.images[0]}
          alt={`${game.title} — ${t.cover}`}
          className="mini-cover"
        />
        <div>
          <h1>{game.title}</h1>
          <ReviewSummary game={game} locale={locale} />
        </div>
      </div>
      <p className="muted fine">
        {sample.returned} {t.sample} · {pagination.total} {t.filtered} ·{" "}
        {sample.recommendation === "all" ? t.all : t[sample.recommendation]} ·{" "}
        {t[sample.sort]}
      </p>
      <p className="muted fine">{t.source}</p>
      <button type="button" disabled={pending} onClick={discuss}>
        {pending ? t.loading : t.discuss}
      </button>
      {error && <p role="alert">{error}</p>}
      <details className="review-comments">
        <summary>{t.evidence}</summary>
        {!reviews.reviews.length && <p>{t.noComments}</p>}
        {reviews.reviews.map((review) => (
          <blockquote key={review.reference}>
            <strong>{review.recommended ? t.positive : t.negative}</strong>
            <p>{review.message}</p>
            <footer>
              <time dateTime={review.created_at}>
                {new Date(review.created_at).toLocaleDateString(locale)}
              </time>{" "}
              · <span>{review.reference}</span>
            </footer>
          </blockquote>
        ))}
        {pagination.pages > 1 && (
          <nav className="pagination" aria-label={t.reviews}>
            <button
              disabled={pending || pagination.page <= 1}
              onClick={() =>
                loadReviews(
                  pagination.page - 1,
                  sample.recommendation,
                  sample.sort,
                )
              }
            >
              {t.previous}
            </button>
            <span>
              {pagination.page}/{pagination.pages}
            </span>
            <button
              disabled={pending || pagination.page >= pagination.pages}
              onClick={() =>
                loadReviews(
                  pagination.page + 1,
                  sample.recommendation,
                  sample.sort,
                )
              }
            >
              {t.next}
            </button>
          </nav>
        )}
      </details>
    </section>
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
    <section className="search-cards" aria-label={t.selection}>
      <h1>{t.selection}</h1>
      {games.slice(0, 5).map((game) => (
        <button
          type="button"
          className="search-row"
          key={game.slug}
          disabled={pending}
          onClick={() => selectGame(game.slug)}
          aria-label={`${t.details}: ${game.title}`}
        >
          <CatalogImage
            key={game.slug}
            url={game.media.cover ?? game.media.images[0]}
            className="search-cover"
            alt={`${game.title} — ${t.cover}`}
          />
          <span className="search-copy">
            <strong>{game.title}</strong>
            <span className="short-description">
              {game.description || t.description}
            </span>
            {game.matching_tags?.length ? (
              <span className="match-reason">
                {t.match} {game.matching_tags.join(" · ")}
              </span>
            ) : (
              <span className="tags">{game.tags.slice(0, 3).join(" · ")}</span>
            )}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ))}
      {games.length > 5 && (
        <p className="muted fine">
          {locale === "en"
            ? `Showing 5 of ${games.length} returned games.`
            : `Mostrando 5 de ${games.length} jogos retornados.`}
        </p>
      )}
    </section>
  );
}
