import { Star } from "lucide-react";
import { formatOutletRating, type OutletRating } from "contracts/outlet-rating";
import { useI18n } from "lib/i18n";

/** An outlet's own score. Keep this alongside editorial copy, outside artwork. */
export function OutletRatingBadge({
  rating,
  className = "",
  variant = "badge",
}: {
  rating?: OutletRating | null;
  className?: string;
  variant?: "badge" | "inline";
}) {
  const { locale, t } = useI18n();
  if (!rating) return null;
  const inline = variant === "inline";
  const highRating =
    rating.scale === "TIER"
      ? rating.value.startsWith("S")
      : rating.value >= (rating.scale === "STARS" ? 4.5 : 9);

  return (
    <span
      role="img"
      aria-label={t("Creator rating: {rating}", {
        rating:
          rating.scale === "STARS"
            ? t("{value} out of 5 stars", {
                value: rating.value.toLocaleString(locale),
              })
            : formatOutletRating(rating, locale),
      })}
      className={`${inline ? "inline-flex shrink-0 items-baseline gap-2 whitespace-nowrap leading-tight" : "inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-violet-300/30 bg-violet-300/10 px-2.5 py-1.5 text-sm font-bold text-violet-200"} ${className}`}
    >
      {inline && (
        <span aria-hidden="true" className="text-xs font-normal text-sf-muted">
          {t("Rating")}
        </span>
      )}
      {!inline && rating.scale === "STARS" && (
        <span aria-hidden="true" className="inline-flex gap-0.5">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className="relative h-3.5 w-3.5">
              <Star size={14} className="text-violet-200/40" />
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{
                  width: `${Math.max(0, Math.min(1, rating.value - index)) * 100}%`,
                }}
              >
                <Star size={14} className="fill-current" />
              </span>
            </span>
          ))}
        </span>
      )}
      <span
        aria-hidden="true"
        className={
          inline
            ? `text-base font-bold tabular-nums ${highRating ? "text-[#E7C894]" : "text-sf-fg"}`
            : undefined
        }
      >
        {rating.scale === "TIER"
          ? rating.value.replace("-", "−")
          : `${rating.value.toLocaleString(locale)}/${rating.scale === "STARS" ? 5 : 10}`}
      </span>
    </span>
  );
}
