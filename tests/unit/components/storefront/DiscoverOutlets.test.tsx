/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DiscoverOutlets } from "components/store/DiscoverOutlets";
import type { HomeCommunity } from "lib/home-client";
import { selectionFixture } from "tests/unit/_fixtures/selection";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock("components/store/FollowOutletButton", () => ({
  FollowOutletButton: () => <button>Follow</button>,
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderCommunities() {
  const outlets: HomeCommunity[] = Array.from({ length: 6 }, (_, index) => ({
    id: `outlet-${index}`,
    slug: `community-${index}`,
    name: `Community ${index}`,
    description: "Published picks",
    logo_url: null,
    cover_url: null,
    games: selectionFixture().games,
  }));
  act(() => root.render(<DiscoverOutlets outlets={outlets} />));
  const track = container.querySelector<HTMLDivElement>('[role="group"]');
  Object.defineProperties(track, {
    clientWidth: { configurable: true, value: 800 },
    scrollWidth: { configurable: true, value: 1732 },
  });
  jest
    .spyOn(track.children[0], "getBoundingClientRect")
    .mockReturnValue({ left: 44, width: 300 } as DOMRect);
  jest
    .spyOn(track.children[1], "getBoundingClientRect")
    .mockReturnValue({ left: 360, width: 300 } as DOMRect);
  const scrollBy = jest.fn((options: ScrollToOptions | number = {}) => {
    const left = typeof options === "number" ? options : (options.left ?? 0);
    track.scrollLeft = Math.min(932, Math.max(0, track.scrollLeft + left));
    track.dispatchEvent(new Event("scroll"));
  });
  track.scrollBy = scrollBy;
  act(() => window.dispatchEvent(new Event("resize")));
  return { track, scrollBy };
}

const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

test("community arrows move a card at a time and disappear at the ends", () => {
  const { track, scrollBy } = renderCommunities();
  expect(button("Previous communities")).toBeNull();
  expect(button("Next communities")).not.toBeNull();
  act(() => button("Next communities").click());
  expect(scrollBy).toHaveBeenLastCalledWith({ left: 316, behavior: "smooth" });
  expect(track.scrollLeft).toBe(316);
  expect(button("Previous communities")).not.toBeNull();
  act(() => button("Next communities").click());
  act(() => button("Next communities").click());
  expect(button("Next communities")).toBeNull();
  act(() => button("Previous communities").click());
  expect(scrollBy).toHaveBeenLastCalledWith({ left: -316, behavior: "smooth" });
  expect(
    container.querySelector('a[href="/item/peak?store=community-0"]'),
  ).not.toBeNull();
});

test("keyboard navigation respects reduced motion and resize removes unnecessary arrows", () => {
  const { track, scrollBy } = renderCommunities();
  window.matchMedia = jest.fn().mockReturnValue({ matches: true });
  act(() =>
    track.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(scrollBy).toHaveBeenLastCalledWith({ left: 316, behavior: "instant" });
  Object.defineProperty(track, "scrollWidth", {
    configurable: true,
    value: 800,
  });
  track.scrollLeft = 0;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(button("Previous communities")).toBeNull();
  expect(button("Next communities")).toBeNull();
});
