import Head from "next/head";
import Form from "next/form";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Search, SlidersHorizontal, ArrowUpDown, Tag } from "lucide-react";

import { CATEGORIES } from "lib/games";
import { StoreLayout } from "components/store/StoreLayout";
import { GameListItem, type GameApi } from "components/store/GameListItem";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const order = searchParams.get("order") || "newest";
  const selectedTags = searchParams.getAll("tags");

  const queryUrl = new URLSearchParams();
  if (q) queryUrl.set("q", q);
  if (order) queryUrl.set("order", order);
  if (selectedTags.length > 0) queryUrl.set("tags", selectedTags.join(","));

  const { data, isLoading } = useSWR<{ games: GameApi[] }>(
    `/api/v1/games?${queryUrl.toString()}`,
    (url) => fetch(url).then((res) => res.json())
  );

  const displayGames = data?.games || [];

  const handleTagToggle = (tag: string) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tags");
    newTags.forEach(t => params.append("tags", t));
    
    router.push(`/search?${params.toString()}`, undefined, { shallow: true });
  };

  const handleOrderChange = (newOrder: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", newOrder);
    router.push(`/search?${params.toString()}`, undefined, { shallow: true });
  };

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      <Head>
        <title>Search Results | Manifold Store</title>
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <style jsx global>{`
        html, body { background-color: #1d0f3b !important; }
      `}</style>

      <main className="w-full pt-28 lg:pt-32 flex flex-col items-center">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-10 flex flex-col lg:flex-row gap-8">
          
          {/* Main Column - Search Results */}
          <div className="flex-1 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-black md:text-5xl text-white drop-shadow-sm">
                Search Results
              </h1>
              {q && (
                <p className="text-white/60 font-bold">
                  Showing results for &quot;<span className="text-white">{q}</span>&quot;
                </p>
              )}
            </div>

            {/* In-page Search Bar */}
            <Form action="/search" className="relative w-full group mt-2">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/40 group-focus-within:text-white transition-colors">
                <Search size={20} />
              </div>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search games..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/10 transition-all shadow-inner font-bold"
              />
              {/* Keep other params hidden so they persist on simple text search via form */}
              {order !== "newest" && <input type="hidden" name="order" value={order} />}
              {selectedTags.map(tag => (
                <input key={tag} type="hidden" name="tags" value={tag} />
              ))}
            </Form>

            <section className="flex flex-col gap-4 mt-4">
              {isLoading ? (
                <div className="py-20 flex justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white/20"></div>
                </div>
              ) : displayGames.length > 0 ? (
                displayGames.map((game) => (
                  <GameListItem key={game.id} game={game} />
                ))
              ) : (
                <div className="py-20 text-center flex flex-col items-center gap-4 border border-white/5 bg-white/5 rounded-[2rem]">
                  <Search size={48} className="text-white/10" />
                  <div className="text-white/20 font-black italic text-3xl uppercase tracking-tighter">
                    No matching games
                  </div>
                  <p className="text-white/40 font-bold">Try adjusting your filters or search terms.</p>
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Column - Filters */}
          <aside className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-6 text-white/80 border-b border-white/10 pb-4">
                <SlidersHorizontal size={20} />
                <h2 className="text-xl font-black uppercase tracking-wider">Filters</h2>
              </div>

              {/* Sort Order */}
              <div className="flex flex-col gap-3 mb-8">
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <ArrowUpDown size={16} />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Sort By</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    { value: "newest", label: "Newest First" },
                    { value: "oldest", label: "Oldest First" },
                    { value: "price_asc", label: "Lowest Price" },
                    { value: "price_desc", label: "Highest Price" },
                    { value: "title_asc", label: "Title (A-Z)" },
                  ].map((option) => (
                    <label 
                      key={option.value} 
                      className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all ${
                        order === option.value ? "bg-white/10 text-white" : "hover:bg-white/5 text-white/60"
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="order" 
                        value={option.value}
                        checked={order === option.value}
                        onChange={() => handleOrderChange(option.value)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="font-bold text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <Tag size={16} />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Categories</h3>
                </div>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {CATEGORIES.filter(c => c !== "For You").map((cat) => (
                    <label 
                      key={cat} 
                      className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all ${
                        selectedTags.includes(cat) ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30" : "hover:bg-white/5 text-white/60 border border-transparent"
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={selectedTags.includes(cat)}
                        onChange={() => handleTagToggle(cat)}
                        className="w-4 h-4 accent-indigo-500 rounded"
                      />
                      <span className="font-bold text-sm">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

SearchPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
