import {
  MessageSquare,
  User,
  CheckCircle2,
  PenLine,
  Loader2,
} from "lucide-react";

import { ReviewCard } from "components/store/ReviewCard";
import type { ItemReviews } from "components/storefront/useItemController";

export function ReviewsSection({
  reviews,
  isInLibrary,
  onWriteReview,
  onDeleteReview,
}: {
  reviews: ItemReviews;
  isInLibrary: boolean;
  onWriteReview: () => void;
  onDeleteReview: () => void;
}) {
  const hasAny = reviews.list.length > 0 || !!reviews.userReview;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-3 text-2xl font-black tracking-tight sm:text-3xl">
              <MessageSquare className="text-violet-300" size={24} />
              Reviews
            </h2>
            <p className="max-w-xl text-sm font-medium leading-6 text-white/45">
              Feedback from players who own the game.
            </p>
          </div>

          {isInLibrary && !reviews.userReview && (
            <button
              onClick={onWriteReview}
              className="group flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <PenLine
                size={18}
                className="group-hover:scale-110 transition-transform"
              />
              Write a Review
            </button>
          )}

          {isInLibrary && reviews.userReview && (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white/40">
              <CheckCircle2 size={18} className="text-emerald-500/50" />
              Reviewed
            </div>
          )}
        </header>

        {reviews.userReview && (
          <div className="mb-4 flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-300">
              <User size={20} />
              Your review
            </h3>
            <div className="max-w-2xl">
              <ReviewCard
                key={reviews.userReview.id}
                review={reviews.userReview}
                isOwn={true}
                onDelete={onDeleteReview}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.isLoading && (
            <div className="col-span-full py-12 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-white/50" />
            </div>
          )}

          {hasAny ? (
            reviews.list.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] px-6 py-14 text-center text-white/40">
              <MessageSquare size={48} strokeWidth={1} />
              <p className="font-semibold">
                No reviews yet. Be the first player to share one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
