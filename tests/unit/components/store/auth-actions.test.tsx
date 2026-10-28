/** @jest-environment jsdom */
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

import { FollowOutletButton } from "components/store/FollowOutletButton";
import { GameWishlistButton } from "components/store/GameWishlistButton";
import { UserMenu } from "components/store/UserMenu";
import { ApiClientError } from "lib/api-client";

const mockSWR = jest.fn();
const mockPush = jest.fn();
const mockGlobalMutate = jest.fn();
const mockMutate = jest.fn();
const mockFetch = jest.fn();
const mockRouter = {
  asPath: "/store?sort=popular#featured",
  push: mockPush,
};

jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSWR(...args),
  useSWRConfig: () => ({ mutate: mockGlobalMutate }),
}));
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (text: string) => text }),
}));

const originalFetch = globalThis.fetch;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  jest.clearAllMocks();
  mockMutate.mockResolvedValue(undefined);
  globalThis.fetch = mockFetch;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mockSWR.mockReturnValue({
    data: { is_wishlisted: false, count: 3 },
    mutate: mockMutate,
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

async function click() {
  await act(async () => container.querySelector("button")!.click());
}

test.each([401, 403])(
  "saving a game with HTTP %i redirects to login without an error message",
  async (status) => {
    mockFetch.mockResolvedValue({ ok: false, status });
    act(() => root.render(<GameWishlistButton slug="signal-garden" />));
    await click();

    expect(mockPush).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
    expect(container.querySelector("button")!.disabled).toBe(false);
  },
);

test("a server error while saving remains an error and allows retrying", async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 500 });
  act(() => root.render(<GameWishlistButton slug="signal-garden" />));
  await click();

  expect(mockPush).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not save this game. Please try again.",
  );
  mockFetch.mockResolvedValue({ ok: true, status: 201 });
  await click();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test.each([false, true])(
  "an authenticated viewer can toggle a game whose saved state is %s",
  async (saved) => {
    mockSWR.mockReturnValue({
      data: { is_wishlisted: saved, count: 3 },
      mutate: mockMutate,
    });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    act(() => root.render(<GameWishlistButton slug="signal-garden" />));
    await click();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/wishlists",
      expect.objectContaining({
        method: saved ? "DELETE" : "POST",
        body: JSON.stringify({ slug: "signal-garden" }),
      }),
    );
    expect(mockMutate).toHaveBeenCalledWith(
      { is_wishlisted: !saved, count: saved ? 2 : 4 },
      { revalidate: false },
    );
    expect(mockPush).not.toHaveBeenCalled();
  },
);

function followState(userError?: Error) {
  mockSWR.mockImplementation((url: string) =>
    url === "/api/v1/user"
      ? { data: userError ? undefined : { id: "viewer" }, error: userError }
      : { data: { is_followed: false }, mutate: mockMutate },
  );
}

test("following an Outlet as a visitor goes straight to login", async () => {
  followState(new ApiClientError(403, "Forbidden"));
  act(() =>
    root.render(<FollowOutletButton storeSlug="curator" storeName="Curator" />),
  );
  await click();
  expect(mockPush).toHaveBeenCalledWith(
    `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

test.each([401, 403])(
  "following after session expiry (HTTP %i) rolls back and redirects",
  async (status) => {
    followState();
    mockFetch.mockResolvedValue({ ok: false, status });
    act(() =>
      root.render(
        <FollowOutletButton storeSlug="curator" storeName="Curator" />,
      ),
    );
    await click();

    expect(mockMutate).toHaveBeenNthCalledWith(1, { is_followed: true }, false);
    expect(mockMutate).toHaveBeenNthCalledWith(
      2,
      { is_followed: false },
      false,
    );
    expect(mockPush).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  },
);

test("a follow server error does not redirect to login", async () => {
  followState();
  mockFetch.mockResolvedValue({ ok: false, status: 500 });
  act(() =>
    root.render(<FollowOutletButton storeSlug="curator" storeName="Curator" />),
  );
  await click();
  expect(mockPush).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Could not update this Outlet",
  );
});

test("the account login link preserves the current location", () => {
  mockSWR.mockReturnValue({ error: new ApiClientError(403, "Forbidden") });
  act(() => root.render(<UserMenu />));
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
  );
});
