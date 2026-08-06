import { Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) {
    return null;
  }

  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div
      className="fixed inset-x-0 z-[60] flex justify-center pointer-events-none top-[env(safe-area-inset-top)]"
      style={{
        transform: `translateY(${isRefreshing ? 12 : pullDistance - 24}px)`,
        opacity: progress,
        transition:
          isRefreshing || pullDistance === 0
            ? "transform 0.2s ease, opacity 0.2s ease"
            : "none",
      }}
    >
      <Loader2
        size={28}
        className={`text-[var(--color-purple-dark)] ${isRefreshing ? "animate-spin" : ""}`}
        style={
          !isRefreshing
            ? { transform: `rotate(${progress * 360}deg)` }
            : undefined
        }
      />
    </div>
  );
}
