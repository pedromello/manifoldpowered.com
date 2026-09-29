import { renderToStaticMarkup } from "react-dom/server";

import { ReviewsSection } from "components/storefront/default/item/ReviewsSection";
import type { ItemReviews } from "components/storefront/useItemController";

function reviews(overrides: Partial<ItemReviews> = {}): ItemReviews {
  return {
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
    ...overrides,
  };
}

const actions = {
  onWriteReview: jest.fn(),
  onEditReview: jest.fn(),
  onDeleteReview: jest.fn(),
};

describe("ReviewsSection preview policy", () => {
  test("hides the review composer action in a read-only preview", () => {
    const markup = renderToStaticMarkup(
      <ReviewsSection reviews={reviews()} readOnly {...actions} />,
    );

    expect(markup).toContain("Preview is read-only");
    expect(markup).not.toContain("Write a Review");
  });

  test("does not expose edit or delete actions for the viewer review", () => {
    const markup = renderToStaticMarkup(
      <ReviewsSection
        reviews={reviews({
          userReview: {
            id: "review-1",
            message: "A thoughtful review.",
            recommended: true,
            username: "player",
          },
          total: 1,
        })}
        readOnly
        {...actions}
      />,
    );

    expect(markup).not.toContain('aria-label="Edit review"');
    expect(markup).not.toContain('aria-label="Delete review"');
    expect(markup).not.toContain(">Reviewed<");
  });

  test("keeps the composer action on the live item page", () => {
    const markup = renderToStaticMarkup(
      <ReviewsSection reviews={reviews()} {...actions} />,
    );

    expect(markup).toContain("Write a Review");
  });
});
