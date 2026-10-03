import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import {
  CatalogCard,
  CatalogSearchCards,
  labels,
} from "components/mcp/CatalogCard";
import { catalogCardController as controller } from "components/mcp/catalog-card-controller";

function CatalogApp() {
  const { games, selected, reviews, locale, pending, error } =
    useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return (
    <main className="manifold-card" lang={locale}>
      <header className="brand">
        <div className="brand-name" aria-label="Manifold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="__MANIFOLD_LOGO__" alt="" />
          <span>MANIFOLD</span>
        </div>
        <span className="brand-caption">
          {locale === "en"
            ? "Discover your next game"
            : "Descubra seu próximo jogo"}
        </span>
      </header>
      {selected ? (
        <>
          {games && (
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={controller.back}
            >
              {labels[locale].back}
            </button>
          )}
          <CatalogCard
            game={selected}
            locale={locale}
            reviews={reviews}
            pending={pending}
            error={error}
            loadReviews={controller.loadReviews}
            openLink={controller.openLink}
          />
        </>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {pending && <p role="status">{labels[locale].loading}</p>}
          {games ? (
            <CatalogSearchCards
              games={games}
              locale={locale}
              selectGame={controller.selectGame}
              pending={pending}
            />
          ) : (
            !error && <p role="status">{labels[locale].loading}</p>
          )}
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<CatalogApp />);
// No direct API fetch, cookies, storage or iframe nesting: the host mediates.
controller.connect();
