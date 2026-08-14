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
  onDismiss,
}: {
  gameTitle: string;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-[#1D0F3B] border border-white/20 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={48} className="text-emerald-400" />
        </div>

        <h2 className="text-2xl font-black text-white mb-4">Game Redeemed!</h2>

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
            Go to Library
          </Link>
          <button
            onClick={onDismiss}
            className="w-full py-4 rounded-xl border border-white/10 text-white font-bold uppercase hover:bg-white/5 transition-colors"
          >
            Continue Browsing
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReviewComposerModal({
  gameTitle,
  isSubmitting,
  onSubmit,
  onDismiss,
}: {
  gameTitle: string;
  isSubmitting: boolean;
  onSubmit: (input: { message: string; recommended: boolean }) => void;
  onDismiss: () => void;
}) {
  // Draft state belongs to the composer, not the page: it exists only while
  // the modal is open and is thrown away when it closes.
  const [form, setForm] = useState({ message: "", recommended: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-3xl animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <button
            onClick={onDismiss}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>

          <h2 className="text-3xl font-black tracking-tighter mb-2">
            Write a Review
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
            <div className="flex gap-4 p-1 bg-white/5 rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, recommended: true }))
                }
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300 ${
                  form.recommended
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.1)]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <ThumbsUp size={18} />
                Recommended
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, recommended: false }))
                }
                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300 ${
                  !form.recommended
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_20px_rgba(251,113,133,0.1)]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <ThumbsDown size={18} />
                Not Recommended
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
                value={form.message}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, message: event.target.value }))
                }
                placeholder="What did you think of the game?"
                className="w-full bg-black/20 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-40 transition-all font-medium"
              />
            </div>

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
                  Post Review
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
  onConfirm,
  onDismiss,
}: {
  isDeleting: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-[#1D0F3B] border border-white/20 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
        <h2 className="text-2xl font-black text-white mb-4">Delete Review?</h2>
        <p className="text-white/60 mb-8">
          Are you sure you want to delete your review? This action cannot be
          undone.
        </p>
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
