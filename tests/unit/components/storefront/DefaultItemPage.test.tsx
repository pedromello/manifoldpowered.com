import { renderToStaticMarkup } from "react-dom/server";
import { useState } from "react";

import { DefaultItemPage } from "components/storefront/default/item/DefaultItemPage";
import type { GameDetailApi } from "components/store/types";
import type { ItemViewProps } from "components/storefront/types";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return { ...actual, useState: jest.fn() };
});

jest.mock("components/storefront/default/item/GameHero", () => ({
  GameHero: () => null,
}));
jest.mock("components/storefront/default/item/ItemDescription", () => ({
  ItemDescription: () => null,
}));
jest.mock("components/storefront/default/item/PurchaseCard", () => ({
  PurchaseCard: () => null,
}));
jest.mock("components/storefront/default/item/ReviewsSection", () => ({
  ReviewsSection: () => null,
}));
jest.mock("components/storefront/default/item/ItemModals", () => ({
  RedeemSuccessModal: () => <div data-modal="redeem" />,
  ReviewComposerModal: () => <div data-modal="review" />,
  ConfirmDeleteReviewModal: () => <div data-modal="delete-review" />,
}));

const mockUseState = jest.mocked(useState);

const game: GameDetailApi = {
  id: "game-1",
  slug: "signal-garden",
  title: "Signal Garden",
  description: "A game.",
  detailed_description: "A game.",
  launch_date: "2026-09-01T00:00:00.000Z",
  price: "10.00",
  developer_name: "Studio",
  tags: [],
  media: { screenshots: [], videos: [] },
  purchase_mode: "PLATFORM",
  external_offer: null,
  meta_tags: {},
  social_links: {},
};

function props(isPreview: boolean): ItemViewProps {
  return {
    game,
    store: null,
    isPreview,
    isLoggedOut: false,
    isInLibrary: false,
    isCheckingLibrary: false,
    isRedeeming: false,
    redeem: jest.fn(),
    acquisitionError: null,
    showSuccessModal: true,
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
      canReview: true,
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

function renderItem(isPreview: boolean) {
  mockUseState
    .mockReturnValueOnce(["create", jest.fn()])
    .mockReturnValueOnce([true, jest.fn()]);
  return renderToStaticMarkup(<DefaultItemPage {...props(isPreview)} />);
}

describe("DefaultItemPage preview policy", () => {
  beforeEach(() => mockUseState.mockReset());

  test("suppresses every acquisition and review mutation modal in preview", () => {
    const markup = renderItem(true);

    expect(markup).not.toContain("data-modal=");
  });

  test("keeps the same modal states available on the live page", () => {
    const markup = renderItem(false);

    expect(markup).toContain('data-modal="redeem"');
    expect(markup).toContain('data-modal="review"');
    expect(markup).toContain('data-modal="delete-review"');
  });
});
