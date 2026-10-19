/** @jest-environment jsdom */
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import LibraryPage from "pages/library";
import PurchasesPage from "pages/library/purchases";
import { ApiClientError } from "lib/api-client";

const mockSWR = jest.fn();
const mockReplace = jest.fn();
const mockMutate = jest.fn();
const mockRouter = { asPath: "/library", isReady: true, replace: mockReplace };

jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSWR(...args),
}));
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/head", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("components/store/StoreHomeLayout", () => ({
  StoreHomeLayout: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("components/library/LibraryGameCard", () => ({
  LibraryGameCard: () => null,
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ locale: "en", t: (text: string) => text }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.isReady = true;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe.each([
  ["library", LibraryPage, "/library?view=grid#games"],
  ["purchases", PurchasesPage, "/library/purchases?source=menu#history"],
] as const)("%s authentication", (_name, Page, path) => {
  beforeEach(() => {
    mockRouter.asPath = path;
  });

  test.each([401, 403])(
    "HTTP %i redirects with the return location",
    (status) => {
      mockSWR.mockReturnValue({
        error: new ApiClientError(status, "Signed out"),
      });
      act(() => root.render(<Page />));
      expect(mockReplace).toHaveBeenCalledWith(
        `/login?callbackUrl=${encodeURIComponent(path)}`,
      );
    },
  );

  test.each([new ApiClientError(500, "Unavailable"), new TypeError("Offline")])(
    "a genuine load failure offers retry instead of login: %s",
    (error) => {
      mockSWR.mockReturnValue({ error, mutate: mockMutate });
      act(() => root.render(<Page />));
      expect(mockReplace).not.toHaveBeenCalled();
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("We could not load your");
      expect(alert?.querySelector("a")).toBeNull();
      act(() => alert?.querySelector("button")!.click());
      expect(mockMutate).toHaveBeenCalled();
    },
  );

  test("waits for the router before redirecting", () => {
    mockRouter.isReady = false;
    mockSWR.mockReturnValue({ error: new ApiClientError(403, "Signed out") });
    act(() => root.render(<Page />));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("an empty authenticated collection stays on the page", () => {
    mockSWR.mockReturnValue({
      data: { games: [], purchases: [], pagination: { total: 0 } },
    });
    act(() => root.render(<Page />));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
