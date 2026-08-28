import { GameListItem } from "components/store/GameListItem";
import { type GameApi } from "components/store/types";
import { useI18n } from "lib/i18n";

/**
 * The catalogue rows, plus the loading and empty states that go with them.
 * The `data-storefront` hooks are what `StorefrontContractGuard` looks for.
 */
export function GameList({
  games,
  isLoading,
  storeSlug,
}: {
  games: GameApi[];
  isLoading: boolean;
  storeSlug?: string;
}) {
  const { t } = useI18n();
  return (
    <section
      data-storefront="game-list"
      className="flex flex-col gap-4 pt-6"
      aria-busy={isLoading}
    >
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white/20"></div>
        </div>
      ) : games.length > 0 ? (
        games.map((game) => (
          <GameListItem key={game.id} game={game} storeSlug={storeSlug} />
        ))
      ) : (
        <div className="py-20 text-center text-white/20 font-black italic text-4xl uppercase tracking-tighter">
          {t("Empty Archives")}
        </div>
      )}
    </section>
  );
}
