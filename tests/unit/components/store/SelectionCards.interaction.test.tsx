/** @jest-environment jsdom */
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OutletSelections } from "components/store/SelectionCards";
import { selectionFixture } from "tests/unit/_fixtures/selection";

const mockSWR = jest.fn();
jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSWR(...args),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("components/store/GameArtwork", () => ({
  GameArtwork: () => null,
}));
jest.mock("components/Pagination", () => ({
  Pagination: ({ onPageChange }: { onPageChange: (page: number) => void }) => (
    <button type="button" onClick={() => onPageChange(2)}>
      Next selections page
    </button>
  ),
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ locale: "en", t: (text: string) => text }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mockSWR.mockImplementation((url: string) => {
    const query = new URL(url, "https://example.test");
    const page = Number(query.searchParams.get("page"));
    const first = selectionFixture().selection;
    const singlePage =
      query.pathname.includes("another-outlet") ||
      !query.searchParams.has("preview");
    return {
      data: {
        selections: singlePage && page > 1 ? [] : [first],
        pagination: {
          page,
          pages: singlePage ? 1 : 2,
          total: singlePage ? 1 : 7,
          limit: 6,
        },
      },
    };
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("another outlet starts at page one even if the previous outlet was paginated", () => {
  act(() => root.render(<OutletSelections slug="example-outlet" preview />));
  act(() => container.querySelector("button")!.click());
  expect(mockSWR.mock.lastCall[0]).toContain("page=2");
  act(() => root.render(<OutletSelections slug="another-outlet" preview />));
  expect(mockSWR.mock.lastCall[0]).toBe(
    "/api/v1/stores/another-outlet/selections?limit=6&page=1&preview=1",
  );
  expect(container.textContent).toContain("Weekend co-op");
});

test("switching from preview to public resets pagination and never hides the public first page", () => {
  act(() => root.render(<OutletSelections slug="example-outlet" preview />));
  act(() => container.querySelector("button")!.click());
  expect(mockSWR.mock.lastCall[0]).toContain("page=2");
  act(() => root.render(<OutletSelections slug="example-outlet" />));
  expect(mockSWR.mock.lastCall[0]).toBe(
    "/api/v1/stores/example-outlet/selections?limit=6&page=1",
  );
  expect(container.textContent).toContain("Weekend co-op");
});
