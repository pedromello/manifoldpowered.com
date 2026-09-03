import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import { MediaGallery } from "components/store/MediaGallery";
import type { GameDetailApi, GameApi } from "components/store/types";
import type { StoreContext } from "components/storefront/types";
import { useI18n } from "lib/i18n";

/**
 * The gallery and the studio's own long-form copy.
 *
 * `rehypeRaw` means the markdown may contain HTML — that is deliberate, it is
 * how studios embed trailers — so the `.markdown-content` rules in
 * styles/global.css are what keep arbitrary markup inside the page's design.
 */
export function ItemDescription({
  game,
  store,
  outletReview,
}: {
  game: GameDetailApi;
  store?: StoreContext | null;
  outletReview?: GameApi["outlet_review"];
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-10 lg:col-span-8">
      <MediaGallery
        videos={game.media.videos}
        images={game.media.screenshots}
        gameTitle={game.title}
      />

      {store && outletReview && (
        <section className="rounded-xl border border-sf-accent/35 bg-sf-accent/[0.08] p-5 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sf-accent">
            {t("The view from {name}", { name: store.name })}
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">
            {outletReview.headline ||
              t("Why we recommend {game}", { game: game.title })}
          </h2>
          <p className="mt-4 whitespace-pre-line text-base leading-7 text-white/80">
            {outletReview.body}
          </p>
        </section>
      )}

      <section className="markdown-content rounded-xl border border-white/[0.08] bg-[#100c17] p-5 sm:p-8">
        {store && outletReview && (
          <h2 className="mb-5 text-2xl font-black text-white">
            {t("About the game")}
          </h2>
        )}
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {game.detailed_description}
        </ReactMarkdown>
      </section>
    </div>
  );
}
