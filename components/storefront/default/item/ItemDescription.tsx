import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

import { MediaGallery } from "components/store/MediaGallery";
import type { GameDetailApi } from "components/store/types";

/**
 * The gallery and the studio's own long-form copy.
 *
 * `rehypeRaw` means the markdown may contain HTML — that is deliberate, it is
 * how studios embed trailers — so the `.markdown-content` rules in
 * styles/global.css are what keep arbitrary markup inside the page's design.
 */
export function ItemDescription({ game }: { game: GameDetailApi }) {
  return (
    <div className="flex flex-col gap-10 lg:col-span-8">
      <MediaGallery
        videos={game.media.videos}
        images={game.media.screenshots}
        gameTitle={game.title}
      />

      <section className="markdown-content rounded-xl border border-white/[0.08] bg-[#100c17] p-5 sm:p-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {game.detailed_description}
        </ReactMarkdown>
      </section>
    </div>
  );
}
