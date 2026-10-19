/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DefaultItemPage } from "components/storefront/default/item/DefaultItemPage";
import { storeContextFromApi } from "components/store/types";
import type { ItemViewProps } from "components/storefront/types";
import { trackExternalStore } from "lib/product-events-client";

jest.mock("next/router", () => ({
  useRouter: () => ({
    query: { store: "unvalidated-outlet" },
    push: jest.fn(),
  }),
}));
jest.mock("lib/product-events-client", () => ({
  trackExternalStore: jest.fn(),
}));
jest.mock("components/storefront/default/item/GameHero", () => ({
  GameHero: () => null,
}));
jest.mock("components/storefront/default/item/ItemDescription", () => ({
  ItemDescription: () => null,
}));
jest.mock("components/storefront/default/item/ReviewsSection", () => ({
  ReviewsSection: () => null,
}));
jest.mock("components/store/ExternalGameRefreshButton", () => ({
  ExternalGameRefreshButton: () => null,
}));

const store = storeContextFromApi({
  id: "store-1",
  slug: "validated-outlet",
  name: "Validated Outlet",
  description: null,
  logo_url: null,
  owner_id: "owner-1",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
});

function props(provider: "steam" | "nintendo"): ItemViewProps {
  return {
    game: {
      id: "game-1",
      slug: "signal-garden",
      title: "Signal Garden",
      description: "A game.",
      detailed_description: "A game.",
      launch_date: "2026-09-01T00:00:00.000Z",
      price: null,
      developer_name: "Studio",
      tags: [],
      media: { screenshots: [], videos: [] },
      purchase_mode: provider === "steam" ? "STEAM_ONLY" : "NINTENDO_ONLY",
      external_offer:
        provider === "nintendo"
          ? {
              provider: "NINTENDO",
              country: "BR",
              currency: "BRL",
              amount: null,
              original_amount: null,
              discount_percent: null,
              captured_at: null,
              url: "https://www.nintendo.com/pt-br/store/products/test/",
            }
          : null,
      meta_tags: {},
      social_links:
        provider === "steam"
          ? { steam_page: "https://store.steampowered.com/app/123" }
          : {},
    },
    store: null,
    isPreview: false,
    isLoggedOut: false,
    isInLibrary: false,
    isCheckingLibrary: false,
    isRedeeming: false,
    redeem: jest.fn(),
    acquisitionError: null,
    showSuccessModal: false,
    dismissSuccess: jest.fn(),
    wishlist: {
      count: 0,
      isWishlisted: false,
      isToggling: false,
      toggle: jest.fn(),
    },
    reviews: {
      list: [],
      userReview: null,
      canReview: false,
      summary: null,
      total: 0,
      page: 1,
      totalPages: 1,
      isLoading: false,
      isSubmitting: false,
      isDeleting: false,
      error: null,
      post: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      setPage: jest.fn(),
      retry: jest.fn(),
      clearError: jest.fn(),
    },
    backHref: "/store",
  };
}

let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.mocked(trackExternalStore).mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

test.each(["steam", "nintendo"] as const)(
  "%s clicks carry only the validated Outlet through the page and purchase card",
  async (provider) => {
    for (const outlet of [store, null]) {
      jest.mocked(trackExternalStore).mockClear();
      await act(async () =>
        root.render(<DefaultItemPage {...props(provider)} store={outlet} />),
      );
      const link =
        document.querySelector<HTMLAnchorElement>('a[target="_blank"]');
      expect(link).not.toBeNull();
      await act(async () =>
        link!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
      expect(trackExternalStore).toHaveBeenCalledTimes(1);
      expect(trackExternalStore).toHaveBeenCalledWith({
        name: "external_store_clicked",
        target: {
          game_slug: "signal-garden",
          ...(outlet ? { store_slug: outlet.slug } : {}),
        },
        properties: { locale: "en", entry_surface: "game_page", provider },
      });
    }
  },
);

test.each(["steam", "nintendo"] as const)(
  "%s games can be saved on Manifold while keeping the external store link",
  async (provider) => {
    const pageProps = props(provider);
    await act(async () => root.render(<DefaultItemPage {...pageProps} />));
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-pressed="false"]',
    );
    expect(button?.textContent).toContain("Add to Wishlist");
    expect(document.querySelector('a[target="_blank"]')).not.toBeNull();

    await act(async () => button!.click());
    expect(pageProps.wishlist.toggle).toHaveBeenCalledTimes(1);
    expect(trackExternalStore).not.toHaveBeenCalled();

    await act(async () =>
      root.render(
        <DefaultItemPage
          {...pageProps}
          wishlist={{ ...pageProps.wishlist, isWishlisted: true }}
        />,
      ),
    );
    const saved = document.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]',
    );
    expect(saved?.textContent).toContain("On Wishlist");
    await act(async () => saved!.click());
    expect(pageProps.wishlist.toggle).toHaveBeenCalledTimes(2);

    await act(async () =>
      root.render(
        <DefaultItemPage
          {...pageProps}
          wishlist={{ ...pageProps.wishlist, isToggling: true }}
        />,
      ),
    );
    expect(
      document.querySelector<HTMLButtonElement>("button[aria-pressed]")
        ?.disabled,
    ).toBe(true);
  },
);

test.each(["steam", "nintendo"] as const)(
  "private previews do not expose or track %s outbound links",
  async (provider) => {
    await act(async () =>
      root.render(
        <DefaultItemPage {...props(provider)} store={store} isPreview />,
      ),
    );
    expect(document.querySelector('a[target="_blank"]')).toBeNull();
    expect(document.querySelector("button[aria-pressed]")).toBeNull();
    expect(trackExternalStore).not.toHaveBeenCalled();
  },
);
