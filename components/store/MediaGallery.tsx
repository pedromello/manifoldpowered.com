import { useState, useMemo, useRef, useEffect } from "react";
import Hls from "hls.js";
import {
  IconPlayerPlayFilled,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useI18n } from "lib/i18n";

interface MediaGalleryProps {
  videos: string[];
  images: string[];
  gameTitle: string;
}

type MediaItem = {
  type: "video" | "image";
  videoType?: "youtube" | "steam";
  url: string;
  id?: string;
};

// Steam serves newer trailers only as HLS (.m3u8) manifests, which play
// natively in Safari/iOS but need hls.js everywhere else. Older mp4/webm
// URLs (also passed through here) play fine as a direct <video src>.
function SteamVideoPlayer({
  url,
  className,
}: {
  url: string;
  className: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (
      !url.includes(".m3u8") ||
      video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      video.src = url;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    }

    video.src = url;
  }, [url]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      playsInline
      className={className}
    />
  );
}

export function MediaGallery({ videos, images, gameTitle }: MediaGalleryProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  // Helper to extract YouTube ID from various formats
  const getYouTubeID = (url: string) => {
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Sync scroll on active index change
  useEffect(() => {
    if (scrollRef.current) {
      const activeElement = scrollRef.current.children[
        activeIndex
      ] as HTMLElement;
      if (activeElement) {
        scrollRef.current.scrollTo({
          left:
            activeElement.offsetLeft -
            scrollRef.current.clientWidth / 2 +
            activeElement.clientWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, [activeIndex]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const totalScrollable = scrollWidth - clientWidth;
      if (totalScrollable > 0) {
        setScrollProgress((scrollLeft / totalScrollable) * 100);
      }
    }
  };

  // Drag Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftStart.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = "grabbing";
    scrollRef.current.style.scrollBehavior = "auto"; // Disable smooth scroll during drag
  };

  const onMouseLeave = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = "grab";
      scrollRef.current.style.scrollBehavior = "smooth";
    }
  };

  const onMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = "grab";
      scrollRef.current.style.scrollBehavior = "smooth";
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 2; // Scroll speed multiplier
    scrollRef.current.scrollLeft = scrollLeftStart.current - walk;
  };

  // Combine media items: Videos first, then Images
  const mediaList = useMemo(() => {
    const videoItems: MediaItem[] = videos.map((url) => {
      const ytId = getYouTubeID(url);
      return {
        type: "video",
        videoType: ytId ? "youtube" : "steam",
        url,
        id: ytId || "",
      };
    });

    const imageItems: MediaItem[] = images.map((url) => ({
      type: "image",
      url,
    }));

    return [...videoItems, ...imageItems];
  }, [videos, images]);

  const activeMedia = mediaList[activeIndex];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % mediaList.length);
  };

  const scrollThumbnails = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (mediaList.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      {/* Stage: Main Display */}
      <div className="group relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {/* Stage Content */}
        {activeMedia.type === "video" ? (
          activeMedia.videoType === "youtube" ? (
            <iframe
              src={`https://www.youtube.com/embed/${activeMedia.id}?rel=0&modestbranding=1&autoplay=1&mute=1`}
              title={t("{title} trailer", { title: gameTitle })}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <SteamVideoPlayer
              url={activeMedia.url}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )
        ) : (
          // Gallery media is supplied by game developers and may be hosted on
          // domains outside Next's image allowlist. Loading it directly also
          // avoids making the local preview server proxy third-party assets.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeMedia.url}
            alt={t("{title} screenshot {number}", {
              title: gameTitle,
              number: activeIndex + 1,
            })}
            className="absolute inset-0 h-full w-full animate-in object-cover fade-in duration-500"
          />
        )}

        {/* Stage Navigation Arrows */}
        {mediaList.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-black/70 text-white/80 opacity-0 transition-colors hover:bg-black group-hover:opacity-100"
              aria-label={t("Previous media")}
            >
              <IconChevronLeft size={24} stroke={2} />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/15 bg-black/70 text-white/80 opacity-0 transition-colors hover:bg-black group-hover:opacity-100"
              aria-label={t("Next media")}
            >
              <IconChevronRight size={24} stroke={2} />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails Collection */}
      <div className="group/thumbs relative flex flex-col gap-3">
        <div className="relative">
          {/* Scroll Buttons */}
          <button
            onClick={() => scrollThumbnails("left")}
            className="absolute left-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-black/80 text-white opacity-0 transition-opacity group-hover/thumbs:opacity-100 md:flex"
          >
            <IconChevronLeft size={20} />
          </button>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onMouseDown={onMouseDown}
            onMouseLeave={onMouseLeave}
            onMouseUp={onMouseUp}
            onMouseMove={onMouseMove}
            className="flex cursor-grab snap-x select-none gap-3 overflow-x-auto pb-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
          >
            {mediaList.map((item, idx) => {
              const isActive = idx === activeIndex;
              const thumbUrl =
                item.type === "video"
                  ? item.videoType === "youtube"
                    ? `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`
                    : images[0] || "/placeholder-game.png"
                  : item.url;

              return (
                <button
                  key={`${item.type}-${idx}`}
                  onClick={() => setActiveIndex(idx)}
                  className={`group/item pointer-events-auto relative aspect-video w-40 flex-shrink-0 snap-start overflow-hidden rounded-lg border transition-colors md:w-48 ${
                    isActive
                      ? "border-violet-400 opacity-100"
                      : "border-white/10 opacity-55 hover:border-white/25 hover:opacity-100"
                  }`}
                >
                  {/* See the main stage above: these URLs are dynamic game
                      media and should not depend on the Next image proxy. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl}
                    alt={t("{title} thumbnail {number}", {
                      title: gameTitle,
                      number: idx + 1,
                    })}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  />

                  {item.type === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/item:bg-black/10 transition-colors pointer-events-none">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-black/65 text-white">
                        <IconPlayerPlayFilled size={20} />
                      </div>
                    </div>
                  )}

                  {isActive && (
                    <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-violet-300/20" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scrollThumbnails("right")}
            className="absolute right-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-black/80 text-white opacity-0 transition-opacity group-hover/thumbs:opacity-100 md:flex"
          >
            <IconChevronRight size={20} />
          </button>
        </div>

        {/* Custom Slider / Progress Indicator */}
        {mediaList.length > 3 && (
          <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="absolute h-full rounded-full bg-violet-400 transition-all duration-150 ease-out"
              style={{
                left: `${scrollProgress}%`,
                width: "25%",
                transform: `translateX(-${scrollProgress}%)`,
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
