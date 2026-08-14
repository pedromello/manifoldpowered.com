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
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12">
      <div className="flex flex-col gap-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-4xl md:text-5xl font-black flex items-center gap-4 tracking-tighter">
              <MessageSquare className="text-indigo-400" />
              Reviews
            </h2>
            <p className="text-white/40 font-bold max-w-xl">
              Real-time field reports from players across the astral network.
              Verified accounts only.
            </p>
          </div>

          {isInLibrary && !reviews.userReview && (
            <button
              onClick={onWriteReview}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white text-white hover:text-black transition-all font-black tracking-wider uppercase border border-white/20 flex items-center gap-2 group"
            >
              <PenLine
                size={18}
                className="group-hover:scale-110 transition-transform"
              />
              Write a Review
            </button>
          )}

          {isInLibrary && reviews.userReview && (
            <div className="px-6 py-3 rounded-xl bg-white/5 text-white/40 font-bold uppercase tracking-wider border border-white/10 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500/50" />
              Reviewed
            </div>
          )}
        </header>

        {reviews.userReview && (
          <div className="flex flex-col gap-4 mb-8">
            <h3 className="text-xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <User size={20} />
              Your Report
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
            <div className="col-span-full py-12 flex flex-col items-center gap-4 bg-white/5 rounded-[2.5rem] border border-white/5 opacity-50">
              <MessageSquare size={48} strokeWidth={1} />
              <p className="font-bold">
                No reviews available for this game yet. Be the first to deploy a
                report!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
