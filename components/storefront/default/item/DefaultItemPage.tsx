import { useState } from "react";

import { GameHero } from "components/storefront/default/item/GameHero";
import { ItemDescription } from "components/storefront/default/item/ItemDescription";
import { PurchaseCard } from "components/storefront/default/item/PurchaseCard";
import { ReviewsSection } from "components/storefront/default/item/ReviewsSection";
import {
  RedeemSuccessModal,
  ReviewComposerModal,
  ConfirmDeleteReviewModal,
} from "components/storefront/default/item/ItemModals";
import type { ItemViewProps } from "components/storefront/types";
import { isFree } from "lib/price";

/**
 * Manifold's own product page, and the fallback for any outlet without a
 * bespoke one.
 *
 * Like DefaultStorefront this is a view — ownership, wishlist, reviews and the
 * acquisition all arrive as props from `useItemController`.
 */
export function DefaultItemPage({
  game,
  store,
  isInLibrary,
  isCheckingLibrary,
  isRedeeming,
  redeem,
  acquisitionError,
  showSuccessModal,
  dismissSuccess,
  wishlist,
  reviews,
  backHref,
}: ItemViewProps) {
  const [reviewMode, setReviewMode] = useState<"create" | "edit" | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isFreeGame = isFree(game);

  return (
    <>
      <main className="w-full bg-[#0b0812] pb-8 text-white">
        <GameHero
          game={
            reviews.summary
              ? {
                  ...game,
                  positive_reviews: reviews.summary.positiveReviews,
                  negative_reviews: reviews.summary.negativeReviews,
                  review_score: reviews.summary.reviewScore,
                }
              : game
          }
          backHref={backHref}
          backLabel={store ? `Back to ${store.name}` : "Back to Outlets"}
        />

        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-10 border-t border-white/[0.08] px-4 py-10 sm:px-6 lg:grid-cols-12 lg:px-10 lg:py-14">
          <ItemDescription game={game} />

          <aside className="flex flex-col gap-8 lg:col-span-4">
            <PurchaseCard
              game={game}
              isFreeGame={isFreeGame}
              isInLibrary={isInLibrary}
              isCheckingLibrary={isCheckingLibrary}
              isRedeeming={isRedeeming}
              acquisitionError={acquisitionError}
              onRedeem={redeem}
              wishlist={wishlist}
            />
          </aside>
        </div>

        <div className="border-t border-white/[0.08]">
          <ReviewsSection
            reviews={reviews}
            onWriteReview={() => {
              reviews.clearError();
              setReviewMode("create");
            }}
            onEditReview={() => {
              reviews.clearError();
              setReviewMode("edit");
            }}
            onDeleteReview={() => {
              reviews.clearError();
              setShowDeleteModal(true);
            }}
          />
        </div>
      </main>

      {showSuccessModal && (
        <RedeemSuccessModal gameTitle={game.title} onDismiss={dismissSuccess} />
      )}

      {reviewMode && (
        <ReviewComposerModal
          gameTitle={game.title}
          mode={reviewMode}
          initialReview={
            reviewMode === "edit" && reviews.userReview
              ? {
                  message: reviews.userReview.message,
                  recommended: reviews.userReview.recommended,
                }
              : undefined
          }
          isSubmitting={reviews.isSubmitting}
          error={reviews.error}
          onSubmit={async (input) => {
            const saved =
              reviewMode === "edit"
                ? await reviews.update(input)
                : await reviews.post(input);
            if (saved) setReviewMode(null);
          }}
          onDismiss={() => {
            reviews.clearError();
            setReviewMode(null);
          }}
        />
      )}

      {showDeleteModal && (
        <ConfirmDeleteReviewModal
          isDeleting={reviews.isDeleting}
          error={reviews.error}
          onConfirm={async () => {
            const removed = await reviews.remove();
            if (removed) setShowDeleteModal(false);
          }}
          onDismiss={() => {
            reviews.clearError();
            setShowDeleteModal(false);
          }}
        />
      )}
    </>
  );
}
