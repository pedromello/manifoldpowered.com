import React from "react";

export interface GameData {
  id: string;
  color: string;
  label: string;
  icon: string;
  miniColor: string;
  price: string;
  description: string;
  tags: string[];
}

function GameCard({
  color,
  label,
  icon,
  price,
  description,
  tags,
}: {
  color: string;
  label: string;
  icon: string;
  price: string;
  description: string;
  tags: string[];
}) {
  return (
    <div
      className={`flex flex-col w-[80vw] sm:w-[60vw] md:w-full max-w-[260px] shrink-0 snap-center p-5 rounded-[2rem] border-[3px] ${color} bg-white shadow-lg hover:shadow-2xl hover:scale-[1.03] hover:-translate-y-2 transition-all duration-300 text-left`}
    >
      <div
        className={`w-full h-28 rounded-2xl bg-gradient-to-br from-[#fffbf6] to-white flex items-center justify-center border-2 border-[var(--color-indigo-light)] mb-4 shadow-inner`}
      >
        <span className="text-5xl drop-shadow-md">{icon}</span>
      </div>
      <div className="flex justify-between items-start mb-2 gap-2">
        <h4 className="font-bold text-lg text-[var(--color-purple-dark)] leading-tight">
          {label}
        </h4>
        <span className="font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg text-sm">
          {price}
        </span>
      </div>
      <p className="text-xs text-[rgba(53,34,89,0.7)] mb-5 leading-relaxed flex-1">
        {description}
      </p>
      <div className="flex flex-wrap gap-1 mt-auto">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-1 rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function StoreNode({
  name,
  games,
  description,
  storeIcon = "🏪",
}: {
  name: string;
  games: GameData[];
  description?: string;
  storeIcon?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-[2rem] border border-[var(--color-indigo-light)] bg-white/80 p-6 md:p-8 shadow-[0_12px_40px_rgba(214,205,255,0.6)] backdrop-blur transition-all duration-300 hover:shadow-[0_20px_60px_rgba(214,205,255,0.9)] hover:-translate-y-3 w-[85vw] sm:w-[60vw] md:w-full max-w-[340px] shrink-0 snap-center relative overflow-hidden h-full">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-indigo-lighter)] rounded-full blur-3xl opacity-50 -mr-10 -mt-10 pointer-events-none" />

      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[var(--color-indigo-light)] to-[#fffbf6] mb-4 shadow-inner flex items-center justify-center text-3xl border-2 border-white z-10">
        {storeIcon}
      </div>
      <div className="text-xl font-black text-[var(--color-purple-dark)] text-center mb-2 leading-tight z-10">
        {name}
      </div>
      {description && (
        <div className="text-sm font-semibold text-[rgba(53,34,89,0.5)] text-center mb-8 px-2 z-10">
          {description}
        </div>
      )}

      <div className="flex flex-col gap-2 bg-white/50 p-4 rounded-2xl border border-[var(--color-indigo-light)] w-full shadow-sm z-10">
        <div className="text-[10px] uppercase font-black text-[rgba(53,34,89,0.4)] tracking-widest pl-1 mb-1">
          Catalog
        </div>
        {games.length > 0 ? (
          games.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100 hover:border-[var(--color-indigo-light)] transition-colors cursor-pointer group"
            >
              <div
                className={`w-10 h-10 rounded-lg ${g.miniColor} flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform`}
              >
                {g.icon}
              </div>
              <div className="flex flex-col flex-1 text-left">
                <span className="text-sm font-bold text-[var(--color-purple-dark)] leading-tight">
                  {g.label}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold">
                  {g.tags[0]}
                </span>
              </div>
              <div className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                {g.price}
              </div>
            </div>
          ))
        ) : (
          <span className="text-xs text-[rgba(53,34,89,0.3)] text-center py-4 font-bold uppercase tracking-widest">
            Store Empty
          </span>
        )}
      </div>
    </div>
  );
}

// Componente para representar o jogo na biblioteca final do player
function LibraryCard({
  game,
  purchasedAt,
}: {
  game: GameData;
  purchasedAt: string;
}) {
  return (
    <div className="flex w-full flex-col sm:flex-row bg-white/90 rounded-[1.5rem] border border-[var(--color-indigo-light)] shadow-sm p-5 md:p-6 gap-6 items-center sm:items-start group hover:shadow-[0_8px_24px_rgba(214,205,255,0.8)] hover:-translate-y-1 transition-all duration-300 text-left">
      <div
        className={`w-28 h-28 shrink-0 rounded-2xl ${game.miniColor} shadow-inner flex items-center justify-center text-5xl border-[4px] border-white group-hover:scale-105 transition-transform`}
      >
        {game.icon}
      </div>
      <div className="flex flex-col flex-1 w-full gap-2">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start w-full gap-2 border-b border-[var(--color-indigo-light)] pb-3">
          <h4 className="text-2xl font-black text-[var(--color-purple-dark)]">
            {game.label}
          </h4>
          <div className="bg-[#fffbf6] text-[rgba(53,34,89,0.8)] border border-[var(--color-indigo-light)] text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg sm:translate-y-1 mt-1 sm:mt-0">
            Bought from:{" "}
            <strong className="text-[var(--color-purple-dark)]">
              {purchasedAt}
            </strong>
          </div>
        </div>
        <p className="text-sm text-[rgba(53,34,89,0.7)] font-semibold mb-3 pr-0 sm:pr-8">
          {game.description}
        </p>
        <button className="mt-auto sm:self-start bg-[var(--color-purple-dark)] hover:scale-105 transition-transform text-[var(--bg-primary)] px-6 py-2.5 rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2 w-full sm:w-auto">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Install Game
        </button>
      </div>
    </div>
  );
}

export default function ConceptDiagram() {
  const games: GameData[] = [
    {
      id: "g1",
      color: "border-[#FF6B6B]",
      label: "Indie RPG",
      icon: "⚔️",
      miniColor: "bg-[#FF6B6B]",
      price: "$19.99",
      description:
        "An epic 50-hour journey focusing on narrative and turn-based combat.",
      tags: ["RPG", "Story-Rich"],
    },
    {
      id: "g2",
      color: "border-[#4ECDC4]",
      label: "Cozy Sim",
      icon: "🌱",
      miniColor: "bg-[#4ECDC4]",
      price: "$14.50",
      description:
        "Build your farm, befriend villagers, and unlock island secrets.",
      tags: ["Simulation", "Relaxing"],
    },
    {
      id: "g3",
      color: "border-[#45B7D1]",
      label: "Action FPS",
      icon: "🎯",
      miniColor: "bg-[#45B7D1]",
      price: "$24.00",
      description: "Fast-paced arena shooter with deep movement mechanics.",
      tags: ["FPS", "Multiplayer"],
    },
  ];

  return (
    <div className="w-full flex flex-col items-center pb-12 mt-4 overflow-x-hidden">
      <div className="flex flex-col items-center w-full max-w-5xl px-4 relative overflow-visible">
        {/* TIER 1 */}
        <div className="flex flex-col items-center w-full">
          <h2 className="text-sm md:text-base uppercase tracking-[0.2em] font-bold mb-8 text-[rgba(53,34,89,0.5)]">
            1. Developers upload their games
          </h2>

          <div
            className="flex flex-row overflow-x-auto md:overflow-visible gap-6 md:gap-8 z-10 w-screen max-w-[100vw] -mx-4 px-8 md:w-full md:mx-0 md:px-0 justify-start md:justify-center items-stretch pb-6 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ animation: "float 6s ease-in-out infinite" }}
          >
            <div className="min-w-[1vw] md:hidden"></div>
            {games.map((g) => (
              <GameCard key={g.id} {...g} />
            ))}
            <div className="min-w-[4vw] md:hidden"></div>
          </div>
        </div>

        {/* ARROWS TO HUB */}
        <div className="h-16 flex items-center justify-center my-1 relative -top-2">
          <svg
            width="40"
            height="70"
            viewBox="0 0 40 70"
            fill="none"
            className="text-[var(--color-indigo-light)]"
          >
            <path
              d="M20 0 V60"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-pulse"
            />
            <path
              d="M10 50 L20 62 L30 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* HUB */}
        <div className="z-20 bg-[var(--color-purple-dark)] text-[var(--bg-primary)] rounded-full px-10 py-4 font-black tracking-wider text-xl md:text-2xl border-[6px] border-[var(--color-indigo-light)] shadow-[0_0_30px_rgba(53,34,89,0.3)]">
          MANIFOLD CORE
        </div>

        {/* ARROWS TO STORES */}
        <div className="w-full max-w-[800px] h-32 relative -top-3 z-0 hidden md:block">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 800 120"
            preserveAspectRatio="none"
            className="text-[var(--color-indigo-light)]"
          >
            <path
              d="M400 0 L400 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-pulse"
            />
            <path
              d="M150 50 L650 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-[pulse_1.5s_ease-in-out_infinite]"
            />
            <path
              d="M150 50 L150 110 M400 50 L400 110 M650 50 L650 110"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-[pulse_1.5s_ease-in-out_infinite]"
            />
            <path
              d="M140 100 L150 112 L160 100 M390 100 L400 112 L410 100 M640 100 L650 112 L660 100"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="h-16 flex flex-col items-center justify-center relative -top-2 z-0 md:hidden">
          <svg
            width="40"
            height="70"
            viewBox="0 0 40 70"
            fill="none"
            className="text-[var(--color-indigo-light)]"
          >
            <path
              d="M20 0 V60"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-pulse"
            />
            <path
              d="M10 50 L20 62 L30 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* TIER 2 */}
        <div className="flex flex-col items-center w-full mt-4 md:mt-0">
          <h2 className="text-sm md:text-base uppercase tracking-[0.2em] font-bold mb-8 text-[rgba(53,34,89,0.5)] text-center px-4">
            2. Games are distributed across hundreds of Manifold stores. (Anyone
            can create a store)
          </h2>

          <div className="flex flex-row md:grid md:grid-cols-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory gap-6 md:gap-10 w-screen max-w-[100vw] -mx-4 px-8 md:w-full md:mx-0 md:px-0 place-items-stretch relative z-10 pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="min-w-[1vw] md:hidden"></div>
            <StoreNode
              name="Cozy Streamer Store"
              description="A curated selection of the best relaxing and wholesome games."
              games={[games[1]]}
              storeIcon="🎙️"
            />
            <StoreNode
              name="Games Curator Store"
              description="The uncompromised catalog of top-tier independent games."
              games={games}
              storeIcon="🔎"
            />
            <StoreNode
              name="RPG Gamers Store"
              description="Everything for the hardcore story-driven role-playing enthusiast."
              games={[games[0]]}
              storeIcon="🎲"
            />
            <div className="min-w-[4vw] md:hidden"></div>
          </div>
        </div>

        {/* ARROWS TO LIBRARY */}
        <div className="w-full max-w-[800px] h-32 relative z-0 hidden md:block">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 800 120"
            preserveAspectRatio="none"
            className="text-[var(--color-indigo-light)]"
          >
            <path
              d="M150 0 L150 60 M400 0 L400 60 M650 0 L650 60"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-pulse"
            />
            <path
              d="M150 60 L650 60"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-[pulse_1.5s_ease-in-out_infinite]"
            />
            <path
              d="M400 60 L400 110"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-pulse"
            />
            <path
              d="M390 100 L400 112 L410 100"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="h-16 flex flex-col items-center justify-center relative -top-1 md:hidden">
          <svg
            width="40"
            height="70"
            viewBox="0 0 800 120"
            fill="none"
            className="text-[var(--color-indigo-light)]"
          >
            <path
              d="M20 0 V60"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray="6 6"
              className="animate-pulse"
            />
            <path
              d="M10 50 L20 62 L30 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* TIER 3 */}
        <div className="flex flex-col items-center w-full max-w-4xl relative -top-3 md:-top-0">
          <h2 className="text-sm md:text-base uppercase tracking-[0.2em] font-bold mb-6 text-[rgba(53,34,89,0.5)] text-center px-4">
            3. All games bought end up in the player&apos;s library
          </h2>

          <div className="w-full rounded-[2.5rem] border border-[var(--color-indigo-light)] bg-white/70 p-6 md:p-12 shadow-xl shadow-[var(--color-indigo-lighter)] backdrop-blur-md text-center flex flex-col items-center transition-transform hover:scale-[1.01] duration-500">
            <h3 className="text-3xl md:text-4xl font-black mb-8">
              Your Universal Library
            </h3>

            <div className="flex flex-col justify-center gap-4 md:gap-5 bg-[rgba(214,205,255,0.4)] p-4 md:p-6 rounded-[2.5rem] w-full border border-white/50 shadow-inner text-left">
              <LibraryCard game={games[0]} purchasedAt="RPG Gamers Store" />
              <LibraryCard game={games[1]} purchasedAt="Cozy Streamer Store" />
              <LibraryCard game={games[2]} purchasedAt="Games Curator Store" />
            </div>

            <p className="mt-8 text-[rgba(53,34,89,0.7)] text-lg max-w-2xl leading-relaxed">
              No matter if you supported a small streamer or a massive youtuber.{" "}
              <strong className="text-[var(--color-purple-dark)]">
                Every purchase empowers the community and your collection
                remains in a single place.
              </strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
