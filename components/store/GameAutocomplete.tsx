import { useState } from "react";
import useSWR from "swr";
import { Search, Loader2 } from "lucide-react";
import { type GameApi } from "components/store/GameListItem";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function GameAutocomplete({
  onSelect,
  placeholder = "Search games...",
}: {
  onSelect: (game: GameApi) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const { data, isLoading } = useSWR<{ games: GameApi[] }>(
    query.trim()
      ? `/api/v1/games?q=${encodeURIComponent(query)}&limit=5`
      : null,
    fetcher,
  );

  const suggestions = data?.games || [];
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  function handleSelect(game: GameApi) {
    onSelect(game);
    setQuery("");
    setIsFocused(false);
  }

  return (
    <div className="relative flex-1 min-w-[200px]">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/30">
        <Search size={16} />
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
      />

      {isFocused && query && (
        <div className="flex flex-col gap-1 absolute top-full mt-2 left-0 w-full max-w-md bg-[#130b25] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-10">
          {isLoading ? (
            <div className="px-6 py-6 flex justify-center">
              <Loader2 className="animate-spin text-white/30" size={20} />
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => handleSelect(game)}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-white/5 text-left"
              >
                <div
                  className="h-10 aspect-[16/9] rounded-lg shrink-0 border border-white/5"
                  style={{
                    background: game.media.banner
                      ? `url(${game.media.banner}) center/cover no-repeat`
                      : defaultGradient,
                  }}
                />
                <span className="font-bold text-white text-sm truncate">
                  {game.title}
                </span>
              </button>
            ))
          ) : (
            <div className="px-6 py-6 text-center text-white/40 font-semibold text-sm">
              No games found matching &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
