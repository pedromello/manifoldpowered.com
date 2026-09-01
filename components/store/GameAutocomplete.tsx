import { type KeyboardEvent, useId, useState } from "react";
import useSWR from "swr";
import { Search, Loader2 } from "lucide-react";
import { type GameApi } from "components/store/types";
import { useI18n } from "lib/i18n";
import { withLocale } from "lib/localized-api";

const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Game search failed with status ${response.status}`);
  }

  return response.json();
};

export function GameAutocomplete({
  onSelect,
  placeholder = "Search games...",
  endpoint = "/api/v1/games",
}: {
  onSelect: (game: GameApi) => void;
  placeholder?: string;
  endpoint?: string;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const { data, error, isLoading } = useSWR<{ games: GameApi[] }>(
    query.trim()
      ? withLocale(
          `${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}&limit=5`,
          locale,
        )
      : null,
    fetcher,
  );

  const suggestions = data?.games || [];
  const isOpen = isFocused && Boolean(query);
  const hasInteractiveSuggestions =
    !isLoading && !error && suggestions.length > 0;
  const activeOptionId =
    hasInteractiveSuggestions && activeIndex >= 0 && suggestions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined;
  const defaultGradient =
    "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)";

  function handleSelect(game: GameApi) {
    onSelect(game);
    setQuery("");
    setIsFocused(false);
    setActiveIndex(-1);
  }

  function moveActiveOption(direction: 1 | -1) {
    if (!hasInteractiveSuggestions) return;

    setActiveIndex((currentIndex) => {
      if (currentIndex < 0 || currentIndex >= suggestions.length) {
        return direction === 1 ? 0 : suggestions.length - 1;
      }

      return (
        (currentIndex + direction + suggestions.length) % suggestions.length
      );
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsFocused(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!query) return;

      event.preventDefault();
      setIsFocused(true);
      moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      isOpen &&
      hasInteractiveSuggestions &&
      activeIndex >= 0
    ) {
      const activeGame = suggestions[activeIndex];

      if (activeGame) {
        event.preventDefault();
        handleSelect(activeGame);
      }
    }
  }

  return (
    <div className="relative flex-1 min-w-[200px]">
      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/30">
        <Search aria-hidden="true" size={16} />
      </div>
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        aria-label={t(placeholder)}
        aria-busy={isLoading}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsFocused(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() =>
          setTimeout(() => {
            setIsFocused(false);
            setActiveIndex(-1);
          }, 200)
        }
        placeholder={t(placeholder)}
        className="w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4 py-2.5 text-base md:text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#130b25]"
      />

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t(placeholder)}
          aria-busy={isLoading}
          className="flex flex-col gap-1 absolute top-full mt-2 left-0 w-full max-w-md bg-[#130b25] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-10"
        >
          {isLoading ? (
            <div
              role="status"
              className="px-6 py-6 flex items-center justify-center gap-2 text-white/40 font-semibold text-sm"
            >
              <Loader2
                aria-hidden="true"
                className="animate-spin text-white/30"
                size={20}
              />
              <span>{t("Loading...")}</span>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="px-6 py-6 text-center text-white/50 font-semibold text-sm"
            >
              {t("Failed to load games.")}
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((game, index) => (
              <button
                key={game.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                tabIndex={-1}
                onClick={() => handleSelect(game)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex min-h-12 touch-manipulation items-center gap-3 px-4 py-2 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/60 text-left ${
                  activeIndex === index ? "bg-white/10" : ""
                }`}
              >
                <div
                  aria-hidden="true"
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
            <div
              role="status"
              className="px-6 py-6 text-center text-white/40 font-semibold text-sm"
            >
              {t("No games found matching {query}", {
                query: `“${query}”`,
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
