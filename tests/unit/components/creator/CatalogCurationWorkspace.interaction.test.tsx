/** @jest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CatalogCurationWorkspace } from "components/creator/CatalogCurationWorkspace";
import type { GameApi } from "components/store/types";

type MockLinkProps = Omit<ComponentProps<"a">, "href"> & { href: string };

const mockMutate = jest.fn();
const mockGlobalMutate = jest.fn();
const mockUseSWR = jest.fn();
const mockFetch = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, pathname: "/store/test/manage" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: MockLinkProps) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("swr", () => ({
  __esModule: true,
  default: () => mockUseSWR(),
  useSWRConfig: () => ({ mutate: mockGlobalMutate }),
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (message: string) => message,
    translateError: (message: string | undefined, fallback: string) =>
      message ?? fallback,
  }),
}));

const game: GameApi = {
  id: "game-1",
  slug: "small-world",
  title: "Small World",
  description: "An adventure.",
  detailed_description: "An adventure.",
  launch_date: null,
  price: null,
  developer_name: "Test Studio",
  tags: [],
  media: { screenshots: [], videos: [] },
  purchase_mode: "UNAVAILABLE",
  external_offer: null,
  outlet_review: {
    headline: "A good adventure",
    body: "A thoughtful world to explore.",
    rating: { scale: "STARS", value: 4.5 },
  },
};

function catalog(review: GameApi["outlet_review"] = game.outlet_review) {
  return {
    games: [
      {
        ...game,
        outlet_review: review,
        in_outlet: true,
        visibility_source: "RULE_OR_CATALOG",
        is_editorial: false,
        editorial_position: null,
        sales_count: 0,
        is_new_release: false,
      },
    ],
    pagination: { page: 1, limit: 12, total: 1, pages: 1 },
    currency: "USD",
    catalog_mode: "ALL",
    draft_revision: 7,
    rating_scale: "STARS",
    totals: {
      all: 1,
      in_outlet: 1,
      outside_outlet: 0,
      editorial: 0,
      new_releases: 0,
      best_sellers: 0,
    },
    facets: [],
    readiness: {
      result_count: 1,
      minimum_count: 5,
      has_minimum_catalog: false,
      featured_count: 0,
      featured_outside_count: 0,
      featured_inside: true,
      ready: false,
    },
  };
}

function deferredResponse() {
  let resolve!: (response: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  mockFetch.mockReturnValueOnce(promise);
  return { resolve, reject };
}

function response(status: number, body = {}) {
  return { ok: status < 400, status, json: async () => body };
}

function button(label: string, scope: ParentNode = document) {
  const found = Array.from(scope.querySelectorAll("button")).find(
    (element) =>
      element.textContent?.trim() === label ||
      element.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`Button ${label} was not rendered`);
  return found;
}

function dialog() {
  const found = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!found) throw new Error("Review dialog was not rendered");
  return found;
}

function key(keyValue: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key: keyValue,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.activeElement?.dispatchEvent(event);
  });
  return event;
}

let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = mockFetch;
  mockUseSWR.mockReturnValue({
    data: catalog(),
    isLoading: false,
    isValidating: false,
    mutate: mockMutate,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<CatalogCurationWorkspace storeSlug="test" />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

function openReview() {
  const trigger = button("Edit review");
  act(() => {
    trigger.focus();
    trigger.click();
  });
  return trigger;
}

test("opens at the first control, wraps Tab and Shift+Tab, and contains external focus", () => {
  const trigger = openReview();
  const close = button("Close", dialog());
  const save = button("Save review", dialog());
  expect(document.activeElement).toBe(close);

  expect(key("Tab", true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(save);
  expect(key("Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(close);

  act(() => trigger.focus());
  expect(document.activeElement).toBe(close);
});

test("keeps focus in a busy dialog, blocks dismissal, and sends repeated Save clicks once", async () => {
  const trigger = openReview();
  const request = deferredResponse();
  const modal = dialog();
  const save = button("Save review", modal);
  act(() => {
    save.focus();
    save.click();
    save.click();
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
    headline: game.outlet_review!.headline,
    body: game.outlet_review!.body,
    rating: game.outlet_review!.rating,
    expected_draft_revision: 7,
  });
  expect(modal.getAttribute("aria-busy")).toBe("true");
  expect(document.activeElement).toBe(modal);
  expect(
    modal.querySelector(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
    ),
  ).toBeNull();
  expect(key("Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(modal);
  expect(key("Tab", true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(modal);
  key("Escape");
  act(() => {
    modal.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.focus();
  });
  expect(dialog()).toBe(modal);
  expect(modal.contains(document.activeElement)).toBe(true);

  await act(async () => request.resolve(response(200)));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(mockMutate).toHaveBeenCalledTimes(1);
});

test.each(["http", "network"])(
  "preserves focus and draft after a %s failure, then permits retry",
  async (failure) => {
    const trigger = openReview();
    const request = deferredResponse();
    act(() => button("Save review", dialog()).click());
    await act(async () => {
      if (failure === "network") request.reject(new Error("Connection failed"));
      else request.resolve(response(500, { message: "Save failed" }));
    });
    const modal = dialog();
    expect(modal.contains(document.activeElement)).toBe(true);
    expect(modal.querySelector('[role="alert"]')?.textContent).toContain(
      "failed",
    );
    expect(modal.querySelector("textarea")?.value).toBe(
      game.outlet_review!.body,
    );
    expect(modal.querySelector("select")?.value).toBe("4.5");
    expect(button("Save review", modal).disabled).toBe(false);
    key("Tab");
    expect(document.activeElement).toBe(button("Close", modal));

    const retry = deferredResponse();
    act(() => button("Save review", modal).click());
    await act(async () => retry.resolve(response(200)));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  },
);

test.each(["Close", "Cancel", "Escape", "backdrop"])(
  "restores the trigger only on closing through %s and can reopen",
  (action) => {
    const trigger = openReview();
    if (action === "Escape") key("Escape");
    else if (action === "backdrop") {
      act(() => {
        dialog().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
    } else act(() => button(action, dialog()).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    act(() => trigger.click());
    expect(document.activeElement).toBe(button("Close", dialog()));
  },
);

test("ignores clicks inside the modal and closes a stale draft with focus restored", async () => {
  const trigger = openReview();
  act(() => {
    dialog()
      .querySelector("textarea")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(dialog()).toBeTruthy();
  const request = deferredResponse();
  act(() => button("Save review", dialog()).click());
  await act(async () => request.resolve(response(409)));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(container.textContent).toContain("This draft changed elsewhere");
});

test("guards repeated removal and retains focus through a failure before Escape closes", async () => {
  const trigger = openReview();
  const request = deferredResponse();
  const remove = button("Remove review", dialog());
  act(() => {
    remove.click();
    remove.click();
  });
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  expect(dialog().contains(document.activeElement)).toBe(true);
  key("Escape");
  expect(dialog()).toBeTruthy();
  await act(async () => request.resolve(response(500)));
  expect(dialog().contains(document.activeElement)).toBe(true);
  expect(button("Remove review", dialog()).disabled).toBe(false);
  key("Escape");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
