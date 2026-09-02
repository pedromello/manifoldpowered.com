import { useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import type { Review, ReviewsApiResponse } from "components/store/ReviewCard";
import { withStore } from "lib/store-context";
import { useI18n } from "lib/i18n";

export type ItemControllerOptions = {
  gameSlug: string;
  /** Resolved public/preview Outlet used for back navigation and theming. */
  storeSlug?: string;
  /**
   * Original attacker-controlled `?store=` value. It deliberately survives a
   * failed public Store projection so the library model can distinguish an
   * unknown slug (leniently unattributed) from a known draft (rejected).
   */
  attributionStoreSlug?: string;
  /** Authenticated working-draft preview; acquisition must stay inert. */
  isPreview?: boolean;
};

export type ItemWishlist = {
  count: number;
  isWishlisted: boolean;
  isToggling: boolean;
  toggle: () => void;
};

export type ItemReviews = {
  /** Everyone else's reviews. The viewer's own is separated out below. */
  list: Review[];
  userReview: Review | null;
  canReview: boolean;
  summary: {
    positiveReviews: number;
    negativeReviews: number;
    reviewScore: string | null;
  } | null;
  total: number;
  page: number;
  totalPages: number;
  /** True only on the first load, so the list does not flash on revalidation. */
  isLoading: boolean;
  isSubmitting: boolean;
  isDeleting: boolean;
  error: string | null;
  post: (input: { message: string; recommended: boolean }) => Promise<boolean>;
  update: (input: {
    message: string;
    recommended: boolean;
  }) => Promise<boolean>;
  remove: () => Promise<boolean>;
  setPage: (page: number) => void;
  retry: () => void;
  clearError: () => void;
};

export type ItemControllerResult = {
  isPreview: boolean;
  isLoggedOut: boolean;
  isInLibrary: boolean;
  isCheckingLibrary: boolean;
  isRedeeming: boolean;
  redeem: () => void;
  acquisitionError: string | null;
  showSuccessModal: boolean;
  dismissSuccess: () => void;
  wishlist: ItemWishlist;
  reviews: ItemReviews;
  /** Where "back" should go: the attributed outlet, or the global storefront. */
  backHref: string;
};

class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

const okJson = async (res: Response) => {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(
      body?.message || `Request failed: ${res.status}`,
      res.status,
    );
  }
  return body;
};

const fetchJson = (url: string) => fetch(url).then(okJson);

export function itemAcquisitionBody(
  gameSlug: string,
  attributionStoreSlug?: string,
) {
  return {
    slug: gameSlug,
    store_slug: attributionStoreSlug,
  };
}

/**
 * Everything the product page does beyond rendering: ownership, wishlist and
 * reviews, plus the acquisition itself.
 *
 * Extracted from the page so a bespoke outlet can ship its own product page
 * without reimplementing any of it — and, just as importantly, without being
 * able to quietly drop the `store_slug` that makes a sale attribute to the
 * outlet that referred it.
 */
export function useItemController({
  gameSlug,
  storeSlug,
  attributionStoreSlug = storeSlug,
  isPreview = false,
}: ItemControllerOptions): ItemControllerResult {
  const router = useRouter();
  const { t, translateError } = useI18n();
  const [reviewPage, setReviewPage] = useState(1);

  const {
    data: libraryData,
    error: libraryError,
    mutate: mutateLibrary,
  } = useSWR(
    isPreview ? null : `/api/v1/library?slug=${encodeURIComponent(gameSlug)}`,
    fetchJson,
    {
      shouldRetryOnError: false,
    },
  );

  const {
    data: reviewsData,
    error: reviewsError,
    mutate: mutateReviews,
    isValidating: isReviewsLoading,
  } = useSWR<ReviewsApiResponse>(
    `/api/v1/reviews?slug=${gameSlug}&page=${reviewPage}&limit=10`,
    fetchJson,
  );

  const { data: wishlistData, mutate: mutateWishlist } = useSWR(
    isPreview ? null : `/api/v1/wishlists?slug=${gameSlug}`,
    (url) => fetch(url).then((res) => res.json()),
  );

  // Anonymous access is forbidden, while a server-side failure is a real
  // library error and must not be disguised as a login redirect.
  const isLoggedOut =
    libraryError instanceof ApiRequestError &&
    (libraryError.status === 401 || libraryError.status === 403);
  const isCheckingLibrary = !isPreview && !libraryData && !libraryError;
  const [hasJustAcquired, setHasJustAcquired] = useState(false);
  const isInLibrary =
    hasJustAcquired ||
    libraryData?.is_owned ||
    libraryData?.games?.some(
      (item: { game: { slug: string } }) => item.game.slug === gameSlug,
    ) ||
    false;

  const [isRedeeming, setIsRedeeming] = useState(false);
  const [acquisitionError, setAcquisitionError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [reviewActionError, setReviewActionError] = useState<string | null>(
    null,
  );
  const [isToggling, setIsToggling] = useState(false);

  const redeem = async () => {
    setAcquisitionError(null);

    // Preview is a design/curation review surface, never a commerce surface.
    // Keep this guard in the controller as well as the default button so a
    // custom ItemPage cannot accidentally acquire a working-draft product.
    if (isPreview) return;

    if (isLoggedOut) {
      router.push(
        `/login?callbackUrl=${encodeURIComponent(
          withStore(`/item/${gameSlug}`, attributionStoreSlug, isPreview),
        )}`,
      );
      return;
    }

    if (isCheckingLibrary || isInLibrary || isRedeeming) return;

    setIsRedeeming(true);
    try {
      const res = await fetch("/api/v1/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          itemAcquisitionBody(gameSlug, attributionStoreSlug),
        ),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || "We could not add this game to your library.",
        );
      }

      setHasJustAcquired(true);
      void mutateLibrary();
      setShowSuccessModal(true);
    } catch (error) {
      console.error(error);
      setAcquisitionError(
        translateError(
          error instanceof Error ? error.message : null,
          "We could not add this game to your library.",
        ),
      );
    } finally {
      setIsRedeeming(false);
    }
  };

  const postReview = async (input: {
    message: string;
    recommended: boolean;
  }) => {
    if (isPreview) return false;
    if (!input.message.trim()) return false;

    setReviewActionError(null);
    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug, ...input }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to post review");
      }

      setReviewPage(1);
      await mutateReviews();
      return true;
    } catch (error) {
      console.error(error);
      setReviewActionError(
        translateError(
          error instanceof Error ? error.message : null,
          "Failed to submit review.",
        ),
      );
      return false;
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const updateReview = async (input: {
    message: string;
    recommended: boolean;
  }) => {
    if (isPreview) return false;
    if (!input.message.trim()) return false;

    setReviewActionError(null);
    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug, ...input }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to update review");
      }

      await mutateReviews();
      return true;
    } catch (error) {
      console.error(error);
      setReviewActionError(
        translateError(
          error instanceof Error ? error.message : null,
          "Failed to update review.",
        ),
      );
      return false;
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const removeReview = async () => {
    if (isPreview) return false;
    setReviewActionError(null);
    setIsDeletingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to delete review");
      }

      setReviewPage(1);
      await mutateReviews();
      return true;
    } catch (error) {
      console.error(error);
      setReviewActionError(
        translateError(
          error instanceof Error ? error.message : null,
          "Failed to delete review.",
        ),
      );
      return false;
    } finally {
      setIsDeletingReview(false);
    }
  };

  const toggleWishlist = async () => {
    if (isPreview) return;
    if (!wishlistData || isToggling) return;
    setIsToggling(true);

    const wasWishlisted = wishlistData.is_wishlisted;

    // Optimistic: the heart flips immediately, then revalidates below.
    mutateWishlist(
      {
        count: wishlistData.count + (wasWishlisted ? -1 : 1),
        is_wishlisted: !wasWishlisted,
      },
      false,
    );

    try {
      const res = await fetch("/api/v1/wishlists", {
        method: wasWishlisted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          alert(t("You need to be logged in to add to wishlist."));
        }
        throw new Error("Failed to toggle wishlist");
      }
    } catch (error) {
      console.error(error);
    } finally {
      mutateWishlist();
      setIsToggling(false);
    }
  };

  return {
    isPreview,
    isLoggedOut,
    isInLibrary,
    isCheckingLibrary,
    isRedeeming,
    redeem,
    acquisitionError:
      acquisitionError ||
      (!isLoggedOut && libraryError instanceof Error
        ? translateError(
            libraryError.message,
            "We could not check your library right now.",
          )
        : null),
    showSuccessModal,
    dismissSuccess: () => setShowSuccessModal(false),

    wishlist: {
      count: wishlistData?.count ?? 0,
      isWishlisted: wishlistData?.is_wishlisted ?? false,
      isToggling,
      toggle: toggleWishlist,
    },

    reviews: {
      // The viewer's own review is pinned separately by the view, so it is
      // filtered out of the general list here rather than in the markup.
      list: isPreview
        ? reviewsData?.reviews || []
        : (reviewsData?.reviews || []).filter(
            (review) => review.id !== reviewsData?.user_review?.id,
          ),
      userReview: isPreview ? null : (reviewsData?.user_review ?? null),
      canReview: !isPreview && (reviewsData?.can_review ?? false),
      summary: reviewsData?.summary
        ? {
            positiveReviews: reviewsData.summary.positive_reviews,
            negativeReviews: reviewsData.summary.negative_reviews,
            reviewScore: reviewsData.summary.review_score,
          }
        : null,
      total: reviewsData?.pagination?.total_items ?? 0,
      page: reviewsData?.pagination?.current_page ?? reviewPage,
      totalPages: reviewsData?.pagination?.total_pages ?? 0,
      isLoading: !reviewsData && isReviewsLoading,
      isSubmitting: isSubmittingReview,
      isDeleting: isDeletingReview,
      error:
        reviewActionError ||
        (reviewsError instanceof Error
          ? translateError(
              reviewsError.message,
              "We could not load reviews right now.",
            )
          : null),
      post: postReview,
      update: updateReview,
      remove: removeReview,
      setPage: (page) => setReviewPage(Math.max(1, page)),
      retry: () => void mutateReviews(),
      clearError: () => setReviewActionError(null),
    },

    backHref: storeSlug
      ? withStore(`/store/${storeSlug}`, undefined, isPreview)
      : "/store",
  };
}
