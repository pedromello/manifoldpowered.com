import { CAROUSEL_DELAY, createCarouselClock } from "lib/carousel-clock";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("loops repeatedly using one clock and resumes the exact remaining time", () => {
  let index = 0;
  const states = jest.fn();
  const clock = createCarouselClock(() => {
    index = (index + 1) % 3;
  }, states);
  clock.start();
  jest.advanceTimersByTime(CAROUSEL_DELAY * 7);
  expect(index).toBe(1);
  jest.advanceTimersByTime(2000);
  clock.block("hover", true);
  expect(states).toHaveBeenLastCalledWith({
    progress: expect.closeTo(1 / 3),
    remaining: 4000,
    running: false,
  });
  clock.block("focus", true);
  jest.advanceTimersByTime(30000);
  clock.block("hover", false);
  expect(index).toBe(1);
  clock.block("focus", false);
  jest.advanceTimersByTime(3999);
  expect(index).toBe(1);
  jest.advanceTimersByTime(1);
  expect(index).toBe(2);
  clock.dispose();
  expect(jest.getTimerCount()).toBe(0);
});

test("manual navigation resets progress while hidden and user pauses remain independent", () => {
  const advance = jest.fn();
  const states = jest.fn();
  const clock = createCarouselClock(advance, states);
  clock.start();
  jest.advanceTimersByTime(5000);
  clock.block("hidden", true);
  clock.block("user", true);
  clock.restart();
  expect(states).toHaveBeenLastCalledWith({
    progress: 0,
    remaining: 6000,
    running: false,
  });
  clock.block("hidden", false);
  jest.advanceTimersByTime(12000);
  expect(advance).not.toHaveBeenCalled();
  clock.block("user", false);
  jest.advanceTimersByTime(6000);
  expect(advance).toHaveBeenCalledTimes(1);
  clock.dispose();
  jest.advanceTimersByTime(12000);
  expect(advance).toHaveBeenCalledTimes(1);
});
