import { useState } from "react";
import Link from "next/link";
import {
  X,
  CheckCircle2,
  Loader2,
  Send,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

export function RedeemSuccessModal({
  gameTitle,
  continueHref,
  onDismiss,
}: {
  gameTitle: string;
  continueHref: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="acquisition-success-title"
    >
      <div className="relative flex w-full max-w-md flex-col items-center rounded-xl border border-white/10 bg-[#14101c] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
        <button
          onClick={onDismiss}
          aria-label="Close success message"
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={48} className="text-emerald-400" />
        </div>

        <h2
          id="acquisition-success-title"
          className="text-2xl font-black text-white mb-4"
        >
          Added to your library
        </h2>

        <p className="text-white/60 mb-8">
          Successfully added{" "}
          <span className="text-white font-bold">{gameTitle}</span> to your
          library. You can now download and play it from your personal
          collection.
        </p>

        <div className="flex flex-col w-full gap-3">
          <Link
            href="/library"
            className="w-full py-4 rounded-xl bg-white text-black font-black uppercase tracking-wider hover:scale-[1.02] transition-transform"
          >
            View in Library
          </Link>
          <Link
            href={continueHref}
            className="w-full py-4 rounded-xl border border-white/10 text-white font-bold uppercase hover:bg-white/5 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ReviewComposerModal({
  gameTitle,
  mode,
  initialReview,
  isSubmitting,
  error,
  onSubmit,
  onDismiss,
}: {
  gameTitle: string;
  mode: "create" | "edit";
  initialReview?: { message: string; recommended: boolean };
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (input: { message: string; recommended: boolean }) => void;
  onDismiss: () => void;
}) {
  // Draft state belongs to the composer, not the page: it exists only while
  // the modal is open and is thrown away when it closes.
  const [form, setForm] = useState(
    initialReview || { message: "", recommended: true },
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-[#14101c] shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <button
            onClick={onDismiss}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>

          <h2 className="mb-2 text-3xl font-black tracking-tight">
            {mode === "edit" ? "Edit Your Review" : "Write a Review"}
          </h2>
          <p className="text-white/50 mb-8 font-medium">
            Share your intel on{" "}
            <span className="text-white font-bold">{gameTitle}</span> with the
            community.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(form);
            }}
            className="flex flex-col gap-6"
          >
            {/* Recommendation Toggle */}
            <div
              className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 sm:gap-4"
              role="group"
              aria-label="Would you recommend this game?"
            >
              <button
                type="button"
                aria-label="Recommend this game"
                aria-pressed={form.recommended}
                onClick={() =>
                  setForm((prev) => ({ ...prev, recommended: true }))
                }
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300 ${
                  form.recommended
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.1)]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <ThumbsUp size={22} aria-hidden="true" />
                <span className="hidden sm:inline">Recommended</span>
              </button>
              <button
                type="button"
                aria-label="Do not recommend this game"
                aria-pressed={!form.recommended}
                onClick={() =>
                  setForm((prev) => ({ ...prev, recommended: false }))
                }
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300 ${
                  !form.recommended
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_20px_rgba(251,113,133,0.1)]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <ThumbsDown size={22} aria-hidden="true" />
                <span className="hidden sm:inline">Not Recommended</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="review-message"
                className="text-xs font-black uppercase tracking-widest text-white/40"
              >
                Your Report
              </label>
              <textarea
                id="review-message"
                required
                maxLength={3000}
                value={form.message}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, message: event.target.value }))
                }
                placeholder="What did you think of the game?"
                className="h-40 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-4 font-medium text-white placeholder:text-white/20 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
              <span className="self-end text-xs font-semibold text-white/30">
                {form.message.length.toLocaleString()} / 3,000
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !form.message.trim()}
              className="w-full py-5 mt-2 rounded-2xl bg-white text-black font-black uppercase tracking-wider hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Transmitting...
                </>
              ) : (
                <>
                  <Send size={20} />
                  {mode === "edit" ? "Save Review" : "Post Review"}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDeleteReviewModal({
  isDeleting,
  error,
  onConfirm,
  onDismiss,
}: {
  isDeleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative flex w-full max-w-md flex-col items-center rounded-xl border border-white/10 bg-[#14101c] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
        <h2 className="text-2xl font-black text-white mb-4">Delete Review?</h2>
        <p className="text-white/60 mb-8">
          Are you sure you want to delete your review? This action cannot be
          undone.
        </p>
        {error && (
          <p
            role="alert"
            className="mb-4 w-full rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200"
          >
            {error}
          </p>
        )}
        <div className="flex flex-col w-full gap-3">
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full py-4 rounded-xl bg-rose-500 text-white font-black uppercase tracking-wider hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              "Delete Review"
            )}
          </button>
          <button
            onClick={onDismiss}
            disabled={isDeleting}
            className="w-full py-4 rounded-xl border border-white/10 text-white font-bold uppercase hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
