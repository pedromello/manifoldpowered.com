import { useState } from "react";
import Head from "next/head";

import { SectionDivider } from "components/store/SectionDivider";
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
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      <Head>
        <title>{game.title} | Manifold Outlets</title>
        <meta name="description" content={game.description} />
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <style jsx global>{`
        html,
        body {
          background-color: #1d0f3b !important;
        }
      `}</style>

      <main className="w-full pt-[calc(env(safe-area-inset-top)+4.75rem)]">
        <GameHero
          game={game}
          backHref={backHref}
          backLabel={store ? `Back to ${store.name}` : "Back to Outlets"}
        />

        <SectionDivider />

        {/* Content Grid */}
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <ItemDescription game={game} />

          <aside className="lg:col-span-4 flex flex-col gap-8">
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

        <SectionDivider />

        <ReviewsSection
          reviews={reviews}
          isInLibrary={isInLibrary}
          onWriteReview={() => setShowReviewModal(true)}
          onDeleteReview={() => setShowDeleteModal(true)}
        />
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
    </div>
  );
}
