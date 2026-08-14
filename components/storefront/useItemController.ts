import { useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import type { Review, ReviewsApiResponse } from "components/store/ReviewCard";
import { withStore } from "lib/store-context";

export type ItemControllerOptions = {
  gameSlug: string;
  /** The outlet this visit is attributed to, resolved server-side from `?store=`. */
  storeSlug?: string;
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
  total: number;
  /** True only on the first load, so the list does not flash on revalidation. */
  isLoading: boolean;
  isSubmitting: boolean;
  isDeleting: boolean;
  post: (input: { message: string; recommended: boolean }) => Promise<boolean>;
  remove: () => Promise<boolean>;
};

export type ItemControllerResult = {
  isLoggedOut: boolean;
  isInLibrary: boolean;
  isRedeeming: boolean;
  redeem: () => void;
  showSuccessModal: boolean;
  dismissSuccess: () => void;
  wishlist: ItemWishlist;
  reviews: ItemReviews;
  /** Where "back" should go: the attributed outlet, or the global storefront. */
  backHref: string;
};

const okJson = (res: Response) => {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

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
}: ItemControllerOptions): ItemControllerResult {
  const router = useRouter();

  const {
    data: libraryData,
    error: libraryError,
    mutate: mutateLibrary,
  } = useSWR("/api/v1/library", okJson, { shouldRetryOnError: false });

  const {
    data: reviewsData,
    mutate: mutateReviews,
    isValidating: isReviewsLoading,
  } = useSWR<ReviewsApiResponse>(
    `/api/v1/reviews?slug=${gameSlug}&page=1&limit=10`,
    (url) => fetch(url).then((res) => res.json()),
  );

  const { data: wishlistData, mutate: mutateWishlist } = useSWR(
    `/api/v1/wishlists?slug=${gameSlug}`,
    (url) => fetch(url).then((res) => res.json()),
  );

  // A failing /api/v1/library is how the page learns there is no session; the
  // endpoint 401s for an anonymous visitor.
  const isLoggedOut = !!libraryError;
  const isInLibrary =
    libraryData?.games?.some(
      (item: { game: { slug: string } }) => item.game.slug === gameSlug,
    ) || false;

  const [isRedeeming, setIsRedeeming] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const redeem = async () => {
    if (isLoggedOut) {
      router.push(
        `/login?callbackUrl=${encodeURIComponent(
          withStore(`/item/${gameSlug}`, storeSlug),
        )}`,
      );
      return;
    }

    if (isInLibrary || isRedeeming) return;

    setIsRedeeming(true);
    try {
      const res = await fetch("/api/v1/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug, store_slug: storeSlug }),
      });

      if (!res.ok) throw new Error("Failed to redeem");

      mutateLibrary();
      setShowSuccessModal(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRedeeming(false);
    }
  };

  const postReview = async (input: {
    message: string;
    recommended: boolean;
  }) => {
    if (!input.message.trim()) return false;

    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug, ...input }),
      });

      if (!res.ok) throw new Error("Failed to post review");

      await mutateReviews();
      return true;
    } catch (error) {
      console.error(error);
      alert("Failed to submit review.");
      return false;
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const removeReview = async () => {
    setIsDeletingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug }),
      });

      if (!res.ok) throw new Error("Failed to delete review");

      await mutateReviews();
      return true;
    } catch (error) {
      console.error(error);
      alert("Failed to delete review.");
      return false;
    } finally {
      setIsDeletingReview(false);
    }
  };

  const toggleWishlist = async () => {
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
          alert("You need to be logged in to add to wishlist.");
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
    isLoggedOut,
    isInLibrary,
    isRedeeming,
    redeem,
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
      list: (reviewsData?.reviews || []).filter(
        (review) => review.id !== reviewsData?.user_review?.id,
      ),
      userReview: reviewsData?.user_review ?? null,
      total: reviewsData?.pagination?.total_items ?? 0,
      isLoading: !reviewsData && isReviewsLoading,
      isSubmitting: isSubmittingReview,
      isDeleting: isDeletingReview,
      post: postReview,
      remove: removeReview,
    },

    backHref: storeSlug ? `/store/${storeSlug}` : "/store",
  };
}
