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
 * app/global.css are what keep arbitrary markup inside the page's design.
 */
export function ItemDescription({ game }: { game: GameDetailApi }) {
  return (
    <div className="lg:col-span-8 flex flex-col gap-12">
      <MediaGallery
        videos={game.media.videos}
        images={game.media.screenshots}
        gameTitle={game.title}
      />

      <section className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {game.detailed_description}
        </ReactMarkdown>
      </section>
    </div>
  );
}
