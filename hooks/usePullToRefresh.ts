import { useEffect, useRef, useState } from "react";

const MAX_PULL = 120;
const LINEAR_ZONE = 20;
const RESISTANCE = 0.4;

interface UsePullToRefreshOptions {
  enabled: boolean;
  threshold: number;
}

interface UsePullToRefreshResult {
  pullDistance: number;
  isRefreshing: boolean;
}

export function usePullToRefresh({
  enabled,
  threshold,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function onTouchStart(e: TouchEvent) {
      if (isRefreshing || window.scrollY > 0) {
        return;
      }
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPullingRef.current || startYRef.current === null) {
        return;
      }

      const rawDelta = e.touches[0].clientY - startYRef.current;

      if (rawDelta <= 0 || window.scrollY > 0) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const damped =
        rawDelta <= LINEAR_ZONE
          ? rawDelta
          : LINEAR_ZONE + (rawDelta - LINEAR_ZONE) * RESISTANCE;
      const clamped = Math.min(damped, MAX_PULL);
      setPullDistance(clamped);

      if (clamped > 0) {
        e.preventDefault();
      }
    }

    function onTouchEnd() {
      if (!isPullingRef.current) {
        return;
      }
      isPullingRef.current = false;
      startYRef.current = null;

      setPullDistance((current) => {
        if (current >= threshold) {
          setIsRefreshing(true);
          window.location.reload();
          return threshold;
        }
        return 0;
      });
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, isRefreshing, threshold]);

  return { pullDistance, isRefreshing };
}
