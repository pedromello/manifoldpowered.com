// lib/games.ts

export type Game = {
  id: string;
  title: string;
  currentPrice: string;
  originalPrice?: string;
  discountLabel?: string;
  tags: string[];
  gradient: string;
};

export const BRAND_GRADIENTS = [
  "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)",
  "linear-gradient(45deg, var(--color-indigo-light) 0%, var(--color-purple-dark) 100%)",
  "linear-gradient(180deg, var(--color-indigo-lighter) 0%, var(--color-indigo-light) 100%)",
  "linear-gradient(210deg, var(--color-purple-dark) 0%, rgba(214,205,255,0.4) 100%)",
  "radial-gradient(circle at top right, var(--color-indigo-light) 0%, var(--color-purple-dark) 100%)",
  "linear-gradient(to right, rgba(53,34,89,0.9), rgba(53,34,89,0.5))",
];

export const CATEGORIES = [
  "For You",
  "Action",
  "RPG",
  "Simulation",
  "Horror",
  "Strategy",
  "Racing",
  "Indie",
];

export const mockGames: Game[] = [
  {
    id: "1",
    title: "Astral Ascent",
    currentPrice: "14.99",
    originalPrice: "24.99",
    discountLabel: "-40%",
    tags: ["Action", "Rogue-lite"],
    gradient: BRAND_GRADIENTS[0],
  },
  {
    id: "2",
    title: "Neon Drifter",
    currentPrice: "19.99",
    tags: ["Racing", "Cyberpunk"],
    gradient: BRAND_GRADIENTS[1],
  },
  {
    id: "3",
    title: "Valley Forge",
    currentPrice: "7.49",
    originalPrice: "14.99",
    discountLabel: "-50%",
    tags: ["Simulation", "Strategy"],
    gradient: BRAND_GRADIENTS[2],
  },
  {
    id: "4",
    title: "Echoes of Eternity",
    currentPrice: "29.99",
    tags: ["RPG", "Story-Rich"],
    gradient: BRAND_GRADIENTS[3],
  },
  {
    id: "5",
    title: "Void Crawler",
    currentPrice: "4.99",
    originalPrice: "9.99",
    discountLabel: "-50%",
    tags: ["Horror", "Survival"],
    gradient: BRAND_GRADIENTS[4],
  },
  {
    id: "6",
    title: "Cozy Tavern",
    currentPrice: "12.99",
    tags: ["Simulation", "Casual"],
    gradient: BRAND_GRADIENTS[5],
  },
  {
    id: "7",
    title: "Blade Master",
    currentPrice: "9.99",
    originalPrice: "19.99",
    discountLabel: "-50%",
    tags: ["Action", "Hack & Slash"],
    gradient: BRAND_GRADIENTS[0],
  },
  {
    id: "8",
    title: "Star Command",
    currentPrice: "34.99",
    tags: ["Strategy", "Sci-Fi"],
    gradient: BRAND_GRADIENTS[1],
  },
  {
    id: "9",
    title: "Pixel Farm",
    currentPrice: "11.24",
    originalPrice: "14.99",
    discountLabel: "-25%",
    tags: ["Simulation", "Indie"],
    gradient: BRAND_GRADIENTS[2],
  },
  {
    id: "10",
    title: "Shadow Step",
    currentPrice: "21.99",
    tags: ["Stealth", "Action"],
    gradient: BRAND_GRADIENTS[3],
  },
  {
    id: "11",
    title: "Mythic Hearts",
    currentPrice: "14.99",
    originalPrice: "29.99",
    discountLabel: "-50%",
    tags: ["RPG", "Fantasy"],
    gradient: BRAND_GRADIENTS[4],
  },
  {
    id: "12",
    title: "Circuit Breaker",
    currentPrice: "15.99",
    tags: ["Puzzle", "Logic"],
    gradient: BRAND_GRADIENTS[5],
  },
];

/**
 * Helper to simulate an API call to fetch games.
 * Currently returns mock data.
 */
export async function getGames(): Promise<Game[]> {
  // Simulate network delay
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockGames), 100);
  });
}
