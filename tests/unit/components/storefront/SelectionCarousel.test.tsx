/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectionCarousel } from "components/storefront/default/SelectionCarousel";
import { selectionFixture } from "tests/unit/_fixtures/selection";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
let container: HTMLDivElement;
let root: Root;
let reduced = false;
beforeEach(() => {
  jest.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: reduced,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
  reduced = false;
});
function entries(count = 3) {
  return Array.from({ length: count }, (_, index) => {
    const entry = selectionFixture();
    entry.selection.id = `selection-${index}`;
    entry.selection.title = `Selection ${index}`;
    return entry;
  });
}
const title = () => container.querySelector("h2")?.textContent;

test("classifies artwork already loaded before hydration without waiting for another load event", () => {
  const complete = jest
    .spyOn(HTMLImageElement.prototype, "complete", "get")
    .mockReturnValue(true);
  const width = jest
    .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
    .mockReturnValue(1000);
  const height = jest
    .spyOn(HTMLImageElement.prototype, "naturalHeight", "get")
    .mockReturnValue(150);
  try {
    act(() => root.render(<SelectionCarousel selections={entries(1)} />));
    expect(
      container
        .querySelector("[data-artwork-layout]")
        .getAttribute("data-artwork-layout"),
    ).toBe("contained");
  } finally {
    complete.mockRestore();
    width.mockRestore();
    height.mockRestore();
  }
});

test("preserves the complete Next Fest strip and restores cover layout for conventional artwork", () => {
  const data = entries(2);
  data[0].selection.cover_url = "https://example.com/image-a.jpg";
  data[1].selection.cover_url = "https://example.com/image-b.jpg";
  act(() => root.render(<SelectionCarousel selections={data} />));
  const artwork = () => container.querySelector("[data-artwork-layout]");
  function loadImage(width: number, height: number) {
    const image = artwork().querySelector("img:last-child");
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: width },
      naturalHeight: { configurable: true, value: height },
    });
    act(() => image.dispatchEvent(new Event("load")));
  }
  expect(artwork().getAttribute("data-artwork-layout")).toBe("loading");
  loadImage(1000, 150);
  expect(artwork().getAttribute("data-artwork-layout")).toBe("contained");
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Show selection: Selection 1"]',
      )
      .click(),
  );
  expect(artwork().getAttribute("data-artwork-layout")).toBe("loading");
  loadImage(1600, 900);
  expect(artwork().getAttribute("data-artwork-layout")).toBe("cover");
  const updated = data.map((entry) => ({
    ...entry,
    selection: { ...entry.selection },
  }));
  updated[1].selection.cover_url = "https://example.com/replacement.jpg";
  act(() => root.render(<SelectionCarousel selections={updated} />));
  expect(artwork().getAttribute("data-artwork-layout")).toBe("loading");
  loadImage(800, 120);
  expect(artwork().getAttribute("data-artwork-layout")).toBe("contained");
});

test("edge arrows wrap both ways and restart the automatic interval", () => {
  act(() => root.render(<SelectionCarousel selections={entries()} />));
  const click = (label: string) =>
    act(() =>
      container
        .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
        .click(),
    );
  click("Previous selection");
  expect(title()).toBe("Selection 2");
  click("Next selection");
  expect(title()).toBe("Selection 0");
  act(() => jest.advanceTimersByTime(4000));
  click("Next selection");
  act(() => jest.advanceTimersByTime(5999));
  expect(title()).toBe("Selection 1");
  act(() => jest.advanceTimersByTime(1));
  expect(title()).toBe("Selection 2");
});
test("cycles, resets after manual choice and pauses for page visibility with remaining time", () => {
  act(() => root.render(<SelectionCarousel selections={entries()} />));
  expect(title()).toBe("Selection 0");
  act(() => jest.advanceTimersByTime(6000 * 4));
  expect(title()).toBe("Selection 1");
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Show selection: Selection 2"]',
      )
      .click(),
  );
  act(() => jest.advanceTimersByTime(2000));
  act(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  act(() => jest.advanceTimersByTime(30000));
  expect(title()).toBe("Selection 2");
  act(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  act(() => jest.advanceTimersByTime(3999));
  expect(title()).toBe("Selection 2");
  act(() => jest.advanceTimersByTime(1));
  expect(title()).toBe("Selection 0");
});
test("reduced motion starts paused and an explicit resume enables rotation", () => {
  reduced = true;
  act(() => root.render(<SelectionCarousel selections={entries()} />));
  act(() => jest.advanceTimersByTime(30000));
  expect(title()).toBe("Selection 0");
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Resume Featured carousel"]',
      )
      .click(),
  );
  act(() => jest.advanceTimersByTime(6000));
  expect(title()).toBe("Selection 1");
});
test("keyboard navigation and focus pause rotation until leaving the carousel", () => {
  act(() => root.render(<SelectionCarousel selections={entries()} />));
  const button = container.querySelector<HTMLButtonElement>("button");
  act(() => {
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
  });
  act(() => jest.advanceTimersByTime(12000));
  expect(title()).toBe("Selection 0");
  act(() =>
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(title()).toBe("Selection 1");
  act(() => (document.activeElement as HTMLElement).blur());
  act(() => jest.advanceTimersByTime(6000));
  expect(title()).toBe("Selection 2");
});
test("one selection has no timer or navigation and uses the selection's artwork", () => {
  const [entry] = entries(1);
  act(() => root.render(<SelectionCarousel selections={[entry]} />));
  expect(container.querySelector("button")).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  expect(container.querySelector("img").getAttribute("src")).toBe(
    entry.selection.cover_url,
  );
  expect(
    container.querySelector(`a[href="${entry.selection.public_path}"]`),
  ).not.toBeNull();
});
test("falls back to the first game artwork and removes every timer when unmounted", () => {
  const data = entries();
  data[0].selection.cover_url = null;
  act(() => root.render(<SelectionCarousel selections={data} />));
  expect(container.querySelector("img").getAttribute("src")).toBe(
    data[0].games[0].media.banner,
  );
  act(() => root.render(null));
  expect(jest.getTimerCount()).toBe(0);
});
