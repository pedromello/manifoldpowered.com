import Link from "next/link";
import { DiscountBadge } from "components/store/DiscountBadge";
import { discountBadgeColor } from "components/store/constants";

export type GameApi = {
  id: string;
  slug: string;
  title: string;
  description: string;
  detailed_description: string;
  launch_date: string;
  price: string;
  base_price?: string;
  discount_label?: string;
  developer_name: string;
  publisher_name?: string;
  tags: string[];
  media: {
    banner?: string;
    screenshots: string[];
    icon?: string;
    videos: string[];
  };
};

export function GameListItem({ game }: { game: GameApi }) {
  const isDemo = !game.price || Number(game.price) === 0;
  const isDiscounted =
    !isDemo && game.base_price && game.base_price !== game.price;
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  return (
    <Link
      href={`/item/${game.slug}`}
      className="group block rounded-3xl border border-white/10 bg-white/5 p-0 md:p-4 shadow-sm backdrop-blur transition-all duration-300 hover:shadow-[0_0_30px_rgba(165,180,252,0.1)] hover:border-white/20 motion-safe:hover:-translate-y-1 relative overflow-hidden"
    >
      <div className="flex items-stretch gap-2 md:gap-6">
        <div
          className="w-32 sm:w-40 md:w-64 aspect-[920/430] rounded-l-3xl md:rounded-2xl overflow-hidden shrink-0 border border-white/5"
          style={{
            background: game.media?.banner
              ? `url(${game.media.banner}) center/cover no-repeat`
              : defaultGradient,
          }}
        >
          <div className="w-full h-full bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
        </div>

        <div className="flex-1 flex md:flex-row md:items-center justify-between md:gap-4 py-2 md:py-4 px-2 md:px-6 min-w-0">
          <div className="md:h-[70%] flex flex-col justify-between min-w-0">
            <div className="min-w-0">
              <h3 className="text-sm md:text-3xl font-black mb-1 text-white group-hover:text-indigo-200 transition-colors truncate">
                {game.title}
              </h3>
            </div>
            <div className="truncate text-xs md:text-base text-white/50">
              {(game.tags || []).join(", ")}
            </div>
          </div>

          <div className="flex items-end gap-1 w-fit">
            <div className="flex w-full h-full">
              <div className="flex items-center">
                {!isDemo &&
                  game.base_price !== game.price &&
                  game.discount_label && (
                    <DiscountBadge label={game.discount_label} size="small" />
                  )}
              </div>
            </div>
            <div className="flex flex-col h-full justify-center pr-2">
              {!isDemo && game.base_price && game.base_price !== game.price && (
                <span className="text-sm md:text-xl font-bold text-white/30 line-through">
                  ${game.base_price}
                </span>
              )}
              <div
                className={`text-lg md:text-3xl font-black uppercase ${isDiscounted ? "" : "text-white"}`}
                style={
                  isDiscounted
                    ? {
                        color: discountBadgeColor,
                        borderColor: discountBadgeColor,
                      }
                    : {}
                }
              >
                {isDemo ? "Free" : `$${game.price}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
