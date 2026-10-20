export const CAROUSEL_DELAY = 6000;
export type ClockState = {
  remaining: number;
  progress: number;
  running: boolean;
};

/** The timeout and visual indicator always derive from this one clock. */
export function createCarouselClock(
  advance: () => void,
  onState: (state: ClockState) => void,
) {
  let remaining = CAROUSEL_DELAY;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const blockers = new Set<string>();
  function emit() {
    onState({
      remaining,
      progress: 1 - remaining / CAROUSEL_DELAY,
      running: timer !== undefined,
    });
  }
  function stop() {
    if (timer !== undefined) {
      remaining = Math.max(0, remaining - (performance.now() - started));
      clearTimeout(timer);
      timer = undefined;
    }
  }
  function resume() {
    if (disposed || blockers.size || timer !== undefined) {
      emit();
      return;
    }
    started = performance.now();
    timer = setTimeout(() => {
      timer = undefined;
      remaining = CAROUSEL_DELAY;
      advance();
      resume();
    }, remaining);
    emit();
  }
  return {
    start: resume,
    block(reason: string, blocked: boolean) {
      stop();
      if (blocked) blockers.add(reason);
      else blockers.delete(reason);
      resume();
    },
    restart() {
      stop();
      remaining = CAROUSEL_DELAY;
      resume();
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
