import { useRef, useState } from "react";
import { Play, X } from "lucide-react";
import {
  featuredVideoSchema,
  type FeaturedVideo as Video,
} from "contracts/featured-video";
import { useI18n } from "lib/i18n";

export function FeaturedVideo({
  video,
  teaser = false,
}: {
  video?: Video | null;
  teaser?: boolean;
}) {
  if (!video) return null;
  const validated = featuredVideoSchema.safeParse(video);
  if (!validated.success) return null;
  return (
    <YouTubeVideo
      key={`${video.video_id}:${video.start_seconds ?? 0}`}
      video={validated.data}
      teaser={teaser}
    />
  );
}

function YouTubeVideo({ video, teaser }: { video: Video; teaser: boolean }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const [thumbnail, setThumbnail] = useState<
    "maxresdefault" | "hqdefault" | null
  >("maxresdefault");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    dialog.current?.close();
    setActive(false);
    trigger.current?.focus();
  }
  const frame = active && (
    <iframe
      title={t("Featured YouTube video")}
      src={`https://www.youtube-nocookie.com/embed/${video.video_id}?autoplay=1&playsinline=1${video.start_seconds ? `&start=${video.start_seconds}` : ""}`}
      className="aspect-video min-h-[200px] w-full rounded-xl border-0 bg-black"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
  return (
    <div className="min-w-0" data-featured-video={teaser ? "teaser" : "hero"}>
      {(!active || teaser) && (
        <button
          ref={trigger}
          type="button"
          onClick={() => {
            setActive(true);
            if (teaser) dialog.current?.showModal();
          }}
          aria-label={t("Play featured video")}
          className={`group relative w-full overflow-hidden rounded-2xl border border-sf-border bg-sf-surface text-left focus-visible:outline-2 focus-visible:outline-sf-accent ${teaser ? "grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-1 sm:gap-0" : ""}`}
        >
          <div
            className={`relative aspect-video w-full bg-black ${teaser ? "" : "min-h-[200px]"}`}
          >
            {thumbnail && (
              // YouTube thumbnails are public images; the player loads only on click.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={thumbnail}
                src={`https://img.youtube.com/vi/${video.video_id}/${thumbnail}.jpg`}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover"
                onLoad={(event) => {
                  // Some videos return a small placeholder for a missing HD image.
                  if (
                    thumbnail === "maxresdefault" &&
                    event.currentTarget.naturalWidth <= 120
                  )
                    setThumbnail("hqdefault");
                }}
                onError={() =>
                  setThumbnail(
                    thumbnail === "maxresdefault" ? "hqdefault" : null,
                  )
                }
              />
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/15">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-black/75 text-white">
                <Play size={24} fill="currentColor" aria-hidden="true" />
              </span>
            </span>
            <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white">
              YouTube
            </span>
          </div>
          {teaser && (
            <span className="py-3 pr-3 sm:px-4">
              <strong className="block text-sm">{t("Featured video")}</strong>
              <span className="mt-1 block text-xs text-sf-muted">
                {t("Watch presentation")}
              </span>
            </span>
          )}
        </button>
      )}
      {!teaser && frame}
      {teaser && (
        <dialog
          ref={dialog}
          onClose={() => {
            setActive(false);
            trigger.current?.focus();
          }}
          className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-4xl rounded-2xl border border-sf-border bg-sf-bg p-4 text-sf-fg backdrop:bg-black/80 sm:p-6"
          aria-label={t("Featured YouTube video")}
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-bold">{t("Featured video")}</h2>
            <button
              autoFocus
              type="button"
              onClick={close}
              aria-label={t("Close video")}
              className="grid min-h-11 min-w-11 place-items-center rounded-full border border-sf-border"
            >
              <X size={20} />
            </button>
          </div>
          {frame}
        </dialog>
      )}
    </div>
  );
}
