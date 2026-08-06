import { useStandaloneMode } from "hooks/useStandaloneMode";
import { usePullToRefresh } from "hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "components/PullToRefreshIndicator";

const THRESHOLD = 70;

export function PullToRefresh() {
  const isStandalone = useStandaloneMode();
  const { pullDistance, isRefreshing } = usePullToRefresh({
    enabled: isStandalone,
    threshold: THRESHOLD,
  });

  if (!isStandalone) {
    return null;
  }

  return (
    <PullToRefreshIndicator
      pullDistance={pullDistance}
      isRefreshing={isRefreshing}
      threshold={THRESHOLD}
    />
  );
}
