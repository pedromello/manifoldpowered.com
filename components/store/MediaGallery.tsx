import { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import {
  IconPlayerPlayFilled,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";

interface MediaGalleryProps {
  videos: string[];
  images: string[];
  gameTitle: string;
}

type MediaItem = {
  type: "video" | "image";
  url: string;
  id?: string;
};

export function MediaGallery({ videos, images, gameTitle }: MediaGalleryProps) {
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
    const videoItems: MediaItem[] = videos.map((url) => ({
      type: "video",
      url,
      id: getYouTubeID(url) || "",
    }));

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
    <section className="flex flex-col gap-6">
      {/* Stage: Main Display */}
      <div className="group relative aspect-video w-full rounded-[2.5rem] overflow-hidden bg-black/40 border border-white/10 shadow-2xl">
        {/* Stage Content */}
        {activeMedia.type === "video" ? (
          <iframe
            src={`https://www.youtube.com/embed/${activeMedia.id}?rel=0&modestbranding=1&autoplay=1&mute=1`}
            title={`${gameTitle} Trailer`}
            className="absolute inset-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <Image
            src={activeMedia.url}
            alt={`${gameTitle} Screenshot ${activeIndex + 1}`}
            fill
            className="object-cover animate-in fade-in duration-500"
            sizes="(max-width: 1280px) 100vw, 1280px"
            priority
          />
        )}

        {/* Stage Navigation Arrows */}
        {mediaList.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/20 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white hover:text-black hover:scale-110 transition-all duration-300 z-10"
              aria-label="Previous media"
            >
              <IconChevronLeft size={32} stroke={2.5} />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/20 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white hover:text-black hover:scale-110 transition-all duration-300 z-10"
              aria-label="Next media"
            >
              <IconChevronRight size={32} stroke={2.5} />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails Collection */}
      <div className="group/thumbs relative flex flex-col gap-4">
        <div className="relative">
          {/* Scroll Buttons */}
          <button
            onClick={() => scrollThumbnails("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-[#1D0F3B]/80 backdrop-blur-md border border-white/10 text-white items-center justify-center z-10 opacity-0 group-hover/thumbs:opacity-100 hover:bg-white hover:text-black transition-all hidden md:flex"
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
            className="flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x scroll-smooth cursor-grab select-none active:cursor-grabbing"
          >
            {mediaList.map((item, idx) => {
              const isActive = idx === activeIndex;
              const thumbUrl =
                item.type === "video"
                  ? `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`
                  : item.url;

              return (
                <button
                  key={`${item.type}-${idx}`}
                  onClick={() => setActiveIndex(idx)}
                  className={`relative flex-shrink-0 w-40 md:w-48 aspect-video rounded-2xl overflow-hidden border-2 transition-all duration-300 snap-start group/item pointer-events-auto ${
                    isActive
                      ? "border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-[0.98]"
                      : "border-transparent opacity-60 hover:opacity-100 grayscale hover:grayscale-0 hover:border-white/20"
                  }`}
                >
                  <Image
                    src={thumbUrl}
                    alt={`${gameTitle} thumbnail ${idx + 1}`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover/item:scale-110 pointer-events-none"
                    sizes="192px"
                  />

                  {item.type === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/item:bg-black/10 transition-colors pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shadow-lg">
                        <IconPlayerPlayFilled size={20} />
                      </div>
                    </div>
                  )}

                  {isActive && (
                    <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scrollThumbnails("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-10 h-10 rounded-full bg-[#1D0F3B]/80 backdrop-blur-md border border-white/10 text-white items-center justify-center z-10 opacity-0 group-hover/thumbs:opacity-100 hover:bg-white hover:text-black transition-all hidden md:flex"
          >
            <IconChevronRight size={20} />
          </button>
        </div>

        {/* Custom Slider / Progress Indicator */}
        {mediaList.length > 3 && (
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden relative group/slider">
            <div
              className="absolute h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)] transition-all duration-150 ease-out rounded-full"
              style={{
                left: `${scrollProgress}%`,
                width: "25%",
                transform: `translateX(-${scrollProgress}%)`,
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}
