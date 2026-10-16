import { useState, type HTMLAttributes } from "react";
import { Gamepad2 } from "lucide-react";

export interface GameArtworkProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  src?: string | null;
  alt?: string;
  loading?: "eager" | "lazy";
  background?: "blurred" | "neutral";
  fill?: boolean;
}

/** Keeps the complete source artwork visible inside a caller-sized frame. */
export function GameArtwork({
  src,
  alt = "",
  loading = "lazy",
  background = "blurred",
  fill = false,
  className = "",
  ...frameProps
}: GameArtworkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const artworkSrc = src?.trim();
  const hasArtwork = Boolean(artworkSrc && artworkSrc !== failedSrc);

  return (
    <div
      {...frameProps}
      className={`${fill ? "absolute inset-0 h-full w-full" : "relative"} isolate overflow-hidden ${className}`}
    >
      <div
        className={`absolute inset-0 ${background === "neutral" ? "bg-[#100d15]" : "bg-[#21182f]"}`}
        aria-hidden="true"
      />
      {hasArtwork ? (
        <>
          {background === "blurred" && (
            // Media may use developer-controlled CDNs outside Next's allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artworkSrc}
              alt=""
              aria-hidden="true"
              loading={loading}
              decoding="async"
              referrerPolicy="no-referrer"
              className="pointer-events-none absolute inset-0 h-full w-full scale-[1.15] object-cover blur-[18px] brightness-[.45]"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={artworkSrc}
            src={artworkSrc}
            alt={alt}
            loading={loading}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedSrc(artworkSrc ?? null)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </>
      ) : (
        <div
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-500/20 to-[#14101c] text-white/35"
        >
          <Gamepad2
            className="h-8 w-8 max-h-[50%] max-w-[50%]"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
