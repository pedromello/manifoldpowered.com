import { useState } from "react";
import { Trash2, ThumbsUp, ThumbsDown } from "lucide-react";

export type Review = {
  id: string;
  user_id: string;
  game_id: string;
  message: string;
  recommended: boolean;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  user?: {
    id: string;
    username: string;
  };
  username?: string;
};

export type ReviewsApiResponse = {
  reviews: Review[];
  user_review: Review | null;
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
  onDelete,
}: {
  review: Review;
  isOwn?: boolean;
  onDelete?: () => void;
}) {
  const username = review.user?.username || review.username || "Anonymous";
  const dateStr = review.created_at || review.createdAt;
  const date = dateStr ? new Date(dateStr).toLocaleDateString() : "Recently";
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldTruncate = review.message.length > 260;
  const displayMessage =
    shouldTruncate && !isExpanded
      ? `${review.message.slice(0, 250)}...`
      : review.message;

  return (
    <div
      className={`p-6 rounded-3xl border flex flex-col gap-4 animate-in fade-in duration-500 ${isOwn ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]" : "bg-white/5 border-white/5"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20 text-indigo-400 font-black uppercase">
            {username[0]}
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm">
              {username}{" "}
              {isOwn && (
                <span className="text-indigo-400 text-xs ml-2">(You)</span>
              )}
            </span>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              {date}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOwn && onDelete && (
            <button
              onClick={onDelete}
              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/10 text-white/40 hover:text-rose-400 transition-all border border-white/5 hover:border-rose-500/20 shadow-sm"
              title="Delete Review"
            >
              <Trash2 size={16} />
            </button>
          )}
          <div
            className={`px-3 py-2 rounded-xl flex items-center gap-2 border text-xs font-black uppercase tracking-wider ${
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
            {review.recommended ? "Recommended" : "Not Recommended"}
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
          className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase self-start mt-1"
        >
          {isExpanded ? "Show Less" : "Read More"}
        </button>
      )}
    </div>
  );
}
