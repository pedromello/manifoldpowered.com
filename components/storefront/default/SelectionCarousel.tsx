import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
import type { SelectionPageApi } from "lib/selection-client";
import { useI18n } from "lib/i18n";
import { createCarouselClock } from "lib/carousel-clock";
import styles from "./SelectionCarousel.module.css";

export function EditorialImage({
  src,
  className = "",
  eager = false,
}: {
  src?: string | null;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div
      className={`overflow-hidden bg-gradient-to-br from-violet-950 to-[#14101c] ${className}`}
    >
      {src && failed !== src && (
        // Creator-selected images can use hosts outside Next's allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(src)}
        />
      )}
    </div>
  );
}

export function selectionArtwork(entry: SelectionPageApi) {
  return entry.selection.cover_url || entry.games[0]?.media?.banner;
}

export function SelectionCarousel({
  selections,
}: {
  selections: SelectionPageApi[];
}) {
  const usable = selections.filter((entry) => entry.games.length).slice(0, 3);
  const identity = usable.map((entry) => entry.selection.id).join("|");
  return usable.length ? <Carousel key={identity} slides={usable} /> : null;
}

function Carousel({ slides }: { slides: SelectionPageApi[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const clock = useRef<ReturnType<typeof createCarouselClock>>(null);
  const fills = useRef<Array<HTMLSpanElement | null>>([]);
  const rail = useRef<HTMLDivElement>(null);
  const choices = useRef<Array<HTMLButtonElement | null>>([]);
  const active = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const multiple = slides.length > 1;

  useEffect(() => {
    const track = rail.current;
    const choice = choices.current[index];
    if (!track || !choice || track.scrollWidth <= track.clientWidth) return;
    track.scrollTo?.({
      left: choice.offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [index]);

  useEffect(() => {
    if (!multiple) return;
    let animation: Animation | undefined;
    const controller = createCarouselClock(
      () => {
        active.current = (active.current + 1) % slides.length;
        setIndex(active.current);
      },
      ({ progress, remaining, running }) => {
        animation?.cancel();
        fills.current.forEach((fill, i) => {
          if (!fill) return;
          fill.style.transform = `scaleX(${i === active.current ? progress : 0})`;
          if (
            i === active.current &&
            running &&
            typeof fill.animate === "function"
          ) {
            animation = fill.animate(
              [
                { transform: `scaleX(${progress})` },
                { transform: "scaleX(1)" },
              ],
              { duration: remaining, fill: "forwards", easing: "linear" },
            );
          }
        });
      },
    );
    clock.current = controller;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => {
      if (motion.matches) {
        setPaused(true);
        controller.block("user", true);
      }
    };
    const visibility = () => controller.block("hidden", document.hidden);
    const pageHide = () => controller.block("page", true);
    const pageShow = () => {
      controller.block("page", false);
      visibility();
    };
    reduced();
    visibility();
    controller.start();
    motion.addEventListener("change", reduced);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {
      controller.dispose();
      animation?.cancel();
      clock.current = null;
      motion.removeEventListener("change", reduced);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
    };
  }, [multiple, slides.length]);

  function choose(next: number) {
    active.current = (next + slides.length) % slides.length;
    setIndex(active.current);
    clock.current?.restart();
  }
  const entry = slides[index];
  return (
    <section
      className={styles.carousel}
      aria-label={t("Featured selections")}
      aria-roledescription={t("carousel")}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") clock.current?.block("hover", true);
      }}
      onPointerLeave={() => clock.current?.block("hover", false)}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible"))
          clock.current?.block("focus", true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          clock.current?.block("focus", false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") clock.current?.block("focus", true);
        if (
          multiple &&
          (event.target as HTMLElement).closest("[data-selection-choice]") &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
        ) {
          event.preventDefault();
          choose(index + (event.key === "ArrowRight" ? 1 : -1));
          choices.current[active.current]?.focus();
        }
      }}
      onTouchStart={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "button, a, [data-carousel-navigation]",
          )
        )
          return;
        touch.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
        clock.current?.block("touch", true);
      }}
      onTouchEnd={(event) => {
        if (!touch.current) return;
        const distance = event.changedTouches[0].clientX - touch.current.x;
        const vertical = event.changedTouches[0].clientY - touch.current.y;
        if (
          multiple &&
          Math.abs(distance) > 50 &&
          Math.abs(distance) > Math.abs(vertical) * 1.4
        )
          choose(index + (distance < 0 ? 1 : -1));
        touch.current = null;
        clock.current?.block("touch", false);
      }}
      onTouchCancel={() => clock.current?.block("touch", false)}
    >
      <article
        className={styles.hero}
        aria-label={entry.selection.title}
        aria-roledescription={t("slide")}
      >
        <EditorialImage
          src={selectionArtwork(entry)}
          className={styles.artwork}
          eager={index === 0}
        />
        <div className={styles.shade} aria-hidden="true" />
        <div className={styles.copy}>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-200">
            {t("Featured selections")}
          </p>
          <h2 className="mt-4 break-words text-3xl font-black leading-tight tracking-tight sm:text-4xl xl:text-5xl">
            {entry.selection.title}
          </h2>
          <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/85">
            {entry.selection.description}
          </p>
          <Link
            href={`/store/${entry.outlet.slug}`}
            className="mt-6 flex w-fit max-w-full items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"
          >
            <EditorialImage
              src={entry.outlet.logo_url}
              className="h-[38px] w-[38px] shrink-0 rounded-xl md:h-11 md:w-11"
            />
            <span className="min-w-0">
              <span className="block text-[11px] text-white/60">
                {t("Selected by")}
              </span>
              <span className="block truncate text-sm font-bold">
                {entry.outlet.name}
              </span>
            </span>
          </Link>
          <Link
            href={entry.selection.public_path}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-[#171120] hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300"
          >
            {t("Explore selection")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </article>
      {multiple && (
        <div className={styles.navigation} data-carousel-navigation>
          <div className={styles.thumbnails} ref={rail}>
            {slides.map((slide, i) => (
              <button
                key={slide.selection.id}
                ref={(node) => {
                  choices.current[i] = node;
                }}
                data-selection-choice
                type="button"
                onClick={() => choose(i)}
                aria-label={t("Show selection: {title}", {
                  title: slide.selection.title,
                })}
                aria-current={index === i ? "true" : undefined}
                className={`${styles.thumbnail} ${index === i ? styles.active : ""}`}
              >
                <EditorialImage
                  src={selectionArtwork(slide)}
                  className="h-12 w-20 shrink-0 rounded-md"
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold sm:text-sm">
                    {slide.selection.title}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-white/50">
                    {slide.outlet.name}
                  </span>
                </span>
                <span className={styles.timeline} aria-hidden="true">
                  <span
                    ref={(node) => {
                      fills.current[i] = node;
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.pause}
            aria-label={t(
              paused ? "Resume Featured carousel" : "Pause Featured carousel",
            )}
            aria-pressed={paused}
            onClick={() => {
              const next = !paused;
              setPaused(next);
              clock.current?.block("user", next);
            }}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
      )}
    </section>
  );
}
