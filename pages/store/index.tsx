// --- Components ---
import { useState } from "react";
import { StoreLayout } from "components/store/StoreLayout";
import { Storefront } from "components/store/Storefront";

export default function StoreOption2() {
  const [showWarning, setShowWarning] = useState(true);

  return (
    <>
      <Storefront
        featuredEndpoint="/api/v1/games"
        listEndpoint="/api/v1/games"
        browsePath="/store"
        searchPagePath="/search"
        pageTitle="Discover (Dark) | Manifold Outlets"
        metaDescription="Explore the best games curated by the community in premium dark mode."
        showDiscover
      />

      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#1c1c1e] p-6 shadow-2xl border border-white/10 text-white">
            <h2 className="mb-4 text-2xl font-black text-orange-400">Wait a second!</h2>
            <p className="mb-6 text-white/80">
              Welcome to the Manifold Sample Store! Please keep in mind that all games, prices, and studios displayed here are <strong>fake</strong>. None of these games are actually being sold, and this environment is for demonstration purposes only.
            </p>
            <button
              onClick={() => setShowWarning(false)}
              className="w-full rounded-xl bg-orange-500 px-4 py-3 font-bold text-white hover:bg-orange-600 transition-colors"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </>
  );
}

StoreOption2.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
