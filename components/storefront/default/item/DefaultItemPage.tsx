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
  isRedeeming,
  redeem,
  showSuccessModal,
  dismissSuccess,
  wishlist,
  reviews,
  backHref,
}: ItemViewProps) {
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // TODO: hardcoded rather than derived from the game's price. Preserved from
  // the previous implementation because changing it changes what every
  // customer is charged, which needs its own decision.
  const isDemo = true;

  return (
    <>
      <main className="w-full bg-[#0b0812] pb-8 text-white">
        <GameHero
          game={game}
          backHref={backHref}
          backLabel={store ? `Back to ${store.name}` : "Back to Outlets"}
        />

        <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-10 border-t border-white/[0.08] px-4 py-10 sm:px-6 lg:grid-cols-12 lg:px-10 lg:py-14">
          <ItemDescription game={game} />

          <aside className="flex flex-col gap-8 lg:col-span-4">
            <PurchaseCard
              game={game}
              isDemo={isDemo}
              isInLibrary={isInLibrary}
              isRedeeming={isRedeeming}
              onRedeem={redeem}
              wishlist={wishlist}
            />
          </aside>
        </div>

        <div className="border-t border-white/[0.08]">
          <ReviewsSection
            reviews={reviews}
            isInLibrary={isInLibrary}
            onWriteReview={() => setShowReviewModal(true)}
            onDeleteReview={() => setShowDeleteModal(true)}
          />
        </div>
      </main>

      {showSuccessModal && (
        <RedeemSuccessModal gameTitle={game.title} onDismiss={dismissSuccess} />
      )}

      {showReviewModal && (
        <ReviewComposerModal
          gameTitle={game.title}
          isSubmitting={reviews.isSubmitting}
          onSubmit={async (input) => {
            const posted = await reviews.post(input);
            if (posted) setShowReviewModal(false);
          }}
          onDismiss={() => setShowReviewModal(false)}
        />
      )}

      {showDeleteModal && (
        <ConfirmDeleteReviewModal
          isDeleting={reviews.isDeleting}
          onConfirm={async () => {
            const removed = await reviews.remove();
            if (removed) setShowDeleteModal(false);
          }}
          onDismiss={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
