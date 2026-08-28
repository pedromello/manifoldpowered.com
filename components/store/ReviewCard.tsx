import { useState } from "react";
import { Pencil, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { useI18n } from "lib/i18n";

export type Review = {
  id: string;
  message: string;
  recommended: boolean;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  user?: {
    id?: string;
    username: string;
  };
  username?: string;
};

export type ReviewsApiResponse = {
  reviews: Review[];
  user_review: Review | null;
  can_review: boolean;
  summary: {
    positive_reviews: number;
    negative_reviews: number;
    review_score: string | null;
  };
  pagination: {
    total_items: number;
    total_pages: number;
    current_page: number;
    items_per_page: number;
  };
};

export function ReviewCard({
  review,
  isOwn,
  onEdit,
  onDelete,
}: {
  review: Review;
  isOwn?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { locale, t } = useI18n();
  const username = review.user?.username || review.username || t("Anonymous");
  const dateStr = review.created_at || review.createdAt;
  const date = dateStr
    ? new Date(dateStr).toLocaleDateString(locale)
    : t("Recently");
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldTruncate = review.message.length > 260;
  const displayMessage =
    shouldTruncate && !isExpanded
      ? `${review.message.slice(0, 250)}...`
      : review.message;

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border p-5 ${isOwn ? "border-violet-400/25 bg-violet-500/[0.08]" : "border-white/[0.08] bg-white/[0.025]"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/15 text-sm font-black uppercase text-violet-300">
            {username[0]}
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm">
              {username}{" "}
              {isOwn && (
                <span className="ml-2 text-xs text-violet-300">
                  ({t("You")})
                </span>
              )}
            </span>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              {date}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOwn && onEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-white/40 transition-colors hover:border-violet-500/25 hover:bg-violet-500/10 hover:text-violet-200"
              title={t("Edit Review")}
              aria-label={t("Edit review")}
            >
              <Pencil size={16} />
            </button>
          )}
          {isOwn && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-white/40 transition-colors hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300"
              title={t("Delete Review")}
              aria-label={t("Delete review")}
            >
              <Trash2 size={16} />
            </button>
          )}
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] ${
              review.recommended
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}
          >
            {review.recommended ? (
              <ThumbsUp size={14} />
            ) : (
              <ThumbsDown size={14} />
            )}
            {review.recommended ? t("Recommended") : t("Not Recommended")}
          </div>
        </div>
      </div>
      <div
        className={`transition-all duration-300 ${isExpanded ? "max-h-48 overflow-y-auto pr-2" : ""}`}
      >
        <p className="text-white/80 leading-relaxed text-base italic break-words">
          &quot;{displayMessage}&quot;
        </p>
      </div>
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 self-start text-xs font-bold uppercase text-violet-300 transition-colors hover:text-violet-200"
        >
          {isExpanded ? t("Show Less") : t("Read More")}
        </button>
      )}
    </div>
  );
}
