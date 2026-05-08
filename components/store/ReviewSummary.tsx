import { ThumbsUp } from "lucide-react";

const SCORE_LABELS: Record<string, { label: string; color: string }> = {
  OVERWHELMINGLY_POSITIVE: {
    label: "Overwhelmingly Positive",
    color: "text-emerald-400",
  },
  VERY_POSITIVE: { label: "Very Positive", color: "text-emerald-400" },
  POSITIVE: { label: "Positive", color: "text-emerald-400" },
  MOSTLY_POSITIVE: { label: "Mostly Positive", color: "text-emerald-400" },
  MIXED: { label: "Mixed", color: "text-white/60" },
  MOSTLY_NEGATIVE: { label: "Mostly Negative", color: "text-rose-400" },
  NEGATIVE: { label: "Negative", color: "text-rose-400" },
  VERY_NEGATIVE: { label: "Very Negative", color: "text-rose-400" },
  OVERWHELMINGLY_NEGATIVE: {
    label: "Overwhelmingly Negative",
    color: "text-rose-400",
  },
};

export function ReviewSummary({
  positive,
  negative,
  reviewScore,
}: {
  positive: number;
  negative: number;
  reviewScore: string | null;
}) {
  const total = positive + negative;
  const ratio = total > 0 ? (positive / total) * 100 : 0;

  let label = "No Reviews";
  let color = "text-white/60";

  if (reviewScore && SCORE_LABELS[reviewScore]) {
    label = SCORE_LABELS[reviewScore].label;
    color = SCORE_LABELS[reviewScore].color;
  } else if (total > 0) {
    label = "Mixed";
  }

  return (
    <div className="flex flex-wrap items-center gap-4 py-2">
      <div className="flex flex-col">
        <span className={`text-sm font-black uppercase tracking-wide ${color}`}>
          {label}
        </span>
        <span className="text-[10px] font-bold text-white/30 truncate">
          Based on {total.toLocaleString()} community reviews
        </span>
      </div>
      {total > 0 && (
        <>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <div className="flex gap-1 items-center bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
            <ThumbsUp size={12} className="text-emerald-400" />
            <span className="text-xs font-black text-emerald-400">
              {ratio.toFixed(0)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}
