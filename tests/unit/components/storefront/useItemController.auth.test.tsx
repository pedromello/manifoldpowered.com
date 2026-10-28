/** @jest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  useItemController,
  type ItemControllerResult,
} from "components/storefront/useItemController";
import { ApiClientError } from "lib/api-client";

const mockSWR = jest.fn();
const mockPush = jest.fn();
const mockFetch = jest.fn();
const mockWishlistMutate = jest.fn();
const mockLibraryMutate = jest.fn();
const mockReviewsMutate = jest.fn();
const mockRouter = {
  asPath: "/item/signal-garden?store=curator&source=selection#reviews",
  push: mockPush,
};
jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSWR(...args),
}));
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    translateError: (message: string | null, fallback: string) =>
      message || fallback,
  }),
}));

const wishlist = { count: 3, is_wishlisted: false };
const reviewInput = { message: "A great game", recommended: true };
const actions = ["redeem", "wishlist", "post", "update", "remove"] as const;
type Action = (typeof actions)[number];
let controller: ItemControllerResult;
let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;

function Harness({ preview = false }: { preview?: boolean }) {
  const value = useItemController({
    gameSlug: "signal-garden",
    attributionStoreSlug: "curator",
    isPreview: preview,
  });
  useEffect(() => {
    controller = value;
  }, [value]);
  return null;
}

type LibraryData = {
  is_owned?: boolean;
  games?: { game?: { slug: string } | null }[];
};

function swrState(
  libraryError?: Error,
  libraryData: LibraryData = { is_owned: false },
) {
  mockSWR.mockImplementation((url: string | null) => {
    if (url?.startsWith("/api/v1/library")) {
      return {
        data: libraryError ? undefined : libraryData,
        error: libraryError,
        mutate: mockLibraryMutate,
      };
    }
    if (url?.startsWith("/api/v1/wishlists")) {
      return { data: wishlist, mutate: mockWishlistMutate };
    }
    return {
      data: { reviews: [], can_review: true },
      mutate: mockReviewsMutate,
    };
  });
}

async function perform(action: Action) {
  await act(async () => {
    switch (action) {
      case "redeem":
        await controller.redeem();
        break;
      case "wishlist":
        await controller.wishlist.toggle();
        break;
      case "post":
        await controller.reviews.post(reviewInput);
        break;
      case "update":
        await controller.reviews.update(reviewInput);
        break;
      case "remove":
        await controller.reviews.remove();
    }
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = mockFetch;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  swrState();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe.each(actions)("%s authentication", (action) => {
  test.each([401, 403])(
    "a visitor with HTTP %i goes straight to login",
    async (status) => {
      swrState(new ApiClientError(status, "Signed out"));
      act(() => root.render(<Harness />));
      await perform(action);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(
        `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
      );
      expect(mockWishlistMutate).not.toHaveBeenCalled();
    },
  );

  test.each([401, 403])(
    "session expiry with HTTP %i redirects without a generic error",
    async (status) => {
      mockFetch.mockResolvedValue({ ok: false, status });
      act(() => root.render(<Harness />));
      await perform(action);

      expect(mockPush).toHaveBeenCalledWith(
        `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
      );
      expect(controller.acquisitionError).toBeNull();
      expect(controller.reviews.error).toBeNull();
      expect(controller.showSuccessModal).toBe(false);
      expect(controller.isRedeeming).toBe(false);
      expect(controller.reviews.isSubmitting).toBe(false);
      expect(controller.reviews.isDeleting).toBe(false);
      expect(controller.wishlist.isToggling).toBe(false);
      if (action === "wishlist") {
        expect(mockWishlistMutate).toHaveBeenCalledWith(wishlist, false);
      }
    },
  );

  test("preview remains read-only without redirecting", async () => {
    act(() => root.render(<Harness preview />));
    await perform(action);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a server failure does not become a login redirect", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "Service unavailable" }),
    });
    act(() => root.render(<Harness />));
    await perform(action);
    expect(mockPush).not.toHaveBeenCalled();
    if (action === "redeem") {
      expect(controller.acquisitionError).toBe("Service unavailable");
    } else if (action === "wishlist") {
      expect(mockWishlistMutate).toHaveBeenCalledWith(wishlist, false);
    } else {
      expect(controller.reviews.error).toBe("Service unavailable");
    }
  });
});

test("acquiring a game still sends the Outlet attribution and shows success", async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 201 });
  act(() => root.render(<Harness />));
  await perform("redeem");
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/v1/library",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ slug: "signal-garden", store_slug: "curator" }),
    }),
  );
  expect(controller.isInLibrary).toBe(true);
  expect(controller.showSuccessModal).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});

test("a library load failure does not mark the viewer as signed out", () => {
  swrState(new ApiClientError(500, "Library unavailable"));
  act(() => root.render(<Harness />));
  expect(controller.isLoggedOut).toBe(false);
  expect(controller.acquisitionError).toBe("Library unavailable");
});

describe("library ownership with unavailable game projections", () => {
  test.each([
    { label: "null game", games: [{ game: null }] },
    { label: "missing game", games: [{}] },
    { label: "undefined game", games: [{ game: undefined }] },
    {
      label: "unavailable and unrelated games",
      games: [{ game: null }, {}, { game: { slug: "another-game" } }],
    },
  ])("$label does not crash or mark the game as owned", ({ games }) => {
    swrState(undefined, { is_owned: false, games });
    act(() => root.render(<Harness />));
    expect(controller.isInLibrary).toBe(false);
    expect(controller.isCheckingLibrary).toBe(false);
    expect(controller.acquisitionError).toBeNull();
  });

  test("a matching owned game after unavailable entries is still recognized", () => {
    swrState(undefined, {
      games: [
        { game: null },
        {},
        { game: { slug: "another-game" } },
        { game: { slug: "signal-garden" } },
      ],
    });
    act(() => root.render(<Harness />));
    expect(controller.isInLibrary).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("the authoritative ownership flag still recognizes an owned game", () => {
    swrState(undefined, { is_owned: true, games: [{ game: null }] });
    act(() => root.render(<Harness />));
    expect(controller.isInLibrary).toBe(true);
  });
});
