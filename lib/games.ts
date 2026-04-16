// lib/games.ts

export type Review = {
  userId: string;
  username: string;
  message: string;
  recommended: boolean;
  createdAt: string;
};

export type Game = {
  id: string;
  title: string;
  description: string;
  launchDate: string;
  about: string; // Markdown supported content
  currentPrice: string;
  originalPrice?: string;
  discountLabel?: string;
  tags: string[];
  gradient: string;
  developerName: string;
  metaTags: {
    singlePlayer: boolean;
    multiplayer: boolean;
    controllerCompatible: boolean;
    coopLocal: boolean;
    coopOnline: boolean;
  };
  socialLinks: {
    x?: string;
    youtube?: string;
    steam?: string;
    itchIo?: string;
    instagram?: string;
    tiktok?: string;
  };
  media: {
    banner: string;
    gallery: string[]; // Links to images
    videos: string[]; // Links to video files/embeds
  };
  reviews: Review[];
  totalPositiveReviews: number;
  totalNegativeReviews: number;
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
    description:
      "A fast-paced 2D platformer rogue-lite set in a modern fantasy world.",
    launchDate: "Nov 14, 2023",
    about: `
### Explore the Astral World
Astral Ascent is a 2D platformer rogue-lite set in a modern fantasy world. As one of 4 characters with very different personalities, you must escape from Garden, an astral prison guarded by 12 powerful and vicious bosses, the Zodiacs.

Astral Ascent Gameplay
<iframe src="https://www.youtube.com/embed/wV9Q3xnRaq8?si=Ys4es3FFA8chGDSI" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

#### Key Features:
- **Unique Characters:** Each with their own spells and playstyle.
- **Vibrant Art Style:** Hand-drawn pixel art that comes to life.
- **Intense Boss Fights:** Face the 12 Zodiacs in epic battles.

> "A masterpiece of the rogue-lite genre." - *Manifold Reviews*
    `,
    currentPrice: "14.99",
    originalPrice: "24.99",
    discountLabel: "-40%",
    tags: ["Action", "Rogue-lite", "RPG", "Indie"],
    gradient: BRAND_GRADIENTS[0],
    developerName: "Hibernian Workshop",
    metaTags: {
      singlePlayer: true,
      multiplayer: false,
      controllerCompatible: true,
      coopLocal: true,
      coopOnline: false,
    },
    socialLinks: {
      x: "https://x.com/hibernianws",
      youtube: "https://youtube.com/@HibernianWorkshop",
      steam: "https://store.steampowered.com/app/1280930/Astral_Ascent/",
    },
    media: {
      banner:
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1280930/header.jpg",
      gallery: [
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_6be80c92570afd159805a081e967128874578fa7.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_bfbe3e2fd6fe34645602c4f30e27ed4eb9841a8a.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_cc1531e6464155973419b878a6f0069807f84ef3.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_6be80c92570afd159805a081e967128874578fa7.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_bfbe3e2fd6fe34645602c4f30e27ed4eb9841a8a.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_cc1531e6464155973419b878a6f0069807f84ef3.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_6be80c92570afd159805a081e967128874578fa7.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_bfbe3e2fd6fe34645602c4f30e27ed4eb9841a8a.1920x1080.jpg?t=1769212800",
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1280930/ss_cc1531e6464155973419b878a6f0069807f84ef3.1920x1080.jpg?t=1769212800",
      ],
      videos: ["https://youtu.be/wV9Q3xnRaq8?si=z5KXk-d62UuNwUO4"],
    },
    reviews: [
      {
        userId: "u1",
        username: "CyberGhost",
        message:
          "Absolutely incredible rogue-lite! The bosses are challenging but fair.",
        recommended: true,
        createdAt: "2024-03-10",
      },
      {
        userId: "u2",
        username: "PixelArtLover",
        message:
          "The hand-drawn art style is breathtaking. One of the best looking games of the year.",
        recommended: true,
        createdAt: "2024-03-05",
      },
      {
        userId: "u3",
        username: "HardcoreGamer",
        message:
          "Found some minor bugs during late game sessions, but overall a solid experience.",
        recommended: true,
        createdAt: "2024-02-28",
      },
      {
        userId: "u4",
        username: "CasualPlayer",
        message:
          "A bit too difficult for me, but I can see the appeal for those who like a challenge.",
        recommended: false,
        createdAt: "2024-02-20",
      },
    ],
    totalPositiveReviews: 12450,
    totalNegativeReviews: 320,
  },
  {
    id: "2",
    title: "Neon Drifter",
    description:
      "High-octane cyberpunk racing through the neon-soaked streets of Neo-Tokyo.",
    launchDate: "Mar 20, 2024",
    about:
      "### Speed into the Future\nNeon Drifter brings the ultimate cyberpunk racing experience to your screen. Customize your hover-car and dominate the underworld championships.",
    currentPrice: "19.99",
    tags: ["Racing", "Cyberpunk"],
    gradient: BRAND_GRADIENTS[1],
    developerName: "Future Drifts",
    metaTags: {
      singlePlayer: true,
      multiplayer: true,
      controllerCompatible: true,
      coopLocal: false,
      coopOnline: true,
    },
    socialLinks: {
      x: "https://x.com/neondrifter",
      instagram: "https://instagram.com/neondrifter",
    },
    media: {
      banner:
        "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?q=80&w=1200",
      gallery: [],
      videos: [],
    },
    reviews: [],
    totalPositiveReviews: 840,
    totalNegativeReviews: 12,
  },
  {
    id: "3",
    title: "Valley Forge",
    description:
      "A deep strategy simulation where you build and defend your medieval settlement.",
    launchDate: "Jan 15, 2022",
    about:
      "Build your kingdom from scratch. Manage resources, defend against invasions, and trade with neighboring lands.",
    currentPrice: "7.49",
    originalPrice: "14.99",
    discountLabel: "-50%",
    tags: ["Simulation", "Strategy"],
    gradient: BRAND_GRADIENTS[2],
    developerName: "Medieval Masters",
    metaTags: {
      singlePlayer: true,
      multiplayer: false,
      controllerCompatible: false,
      coopLocal: false,
      coopOnline: false,
    },
    socialLinks: {
      steam: "https://store.steampowered.com",
    },
    media: {
      banner:
        "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?q=80&w=1200",
      gallery: [],
      videos: [],
    },
    reviews: [],
    totalPositiveReviews: 4500,
    totalNegativeReviews: 890,
  },
  // Adding default properties for the rest of mockGames to avoid TS errors
  ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => ({
    id: i.toString(),
    title:
      i === 4
        ? "Echoes of Eternity"
        : i === 5
          ? "Void Crawler"
          : i === 6
            ? "Cozy Tavern"
            : i === 7
              ? "Blade Master"
              : i === 8
                ? "Star Command"
                : i === 9
                  ? "Pixel Farm"
                  : i === 10
                    ? "Shadow Step"
                    : i === 11
                      ? "Mythic Hearts"
                      : "Circuit Breaker",
    description: "A mysterious journey through time and space.",
    launchDate: "2024",
    about: "Content coming soon.",
    currentPrice: [
      "29.99",
      "4.99",
      "12.99",
      "9.99",
      "34.99",
      "11.24",
      "21.99",
      "14.99",
      "15.99",
    ][i - 4],
    originalPrice:
      i === 5
        ? "9.99"
        : i === 7
          ? "19.99"
          : i === 9
            ? "14.99"
            : i === 11
              ? "29.99"
              : undefined,
    discountLabel:
      i === 5
        ? "-50%"
        : i === 7
          ? "-50%"
          : i === 9
            ? "-25%"
            : i === 11
              ? "-50%"
              : undefined,
    tags:
      i === 4
        ? ["RPG", "Story-Rich"]
        : i === 5
          ? ["Horror", "Survival"]
          : i === 6
            ? ["Simulation", "Casual"]
            : i === 7
              ? ["Action", "Hack & Slash"]
              : i === 8
                ? ["Strategy", "Sci-Fi"]
                : i === 9
                  ? ["Simulation", "Indie"]
                  : i === 10
                    ? ["Stealth", "Action"]
                    : i === 11
                      ? ["RPG", "Fantasy"]
                      : ["Puzzle", "Logic"],
    gradient: BRAND_GRADIENTS[(i - 1) % 6],
    developerName: "Indie Dev",
    metaTags: {
      singlePlayer: true,
      multiplayer: false,
      controllerCompatible: true,
      coopLocal: false,
      coopOnline: false,
    },
    socialLinks: {},
    media: {
      banner:
        "https://images.unsplash.com/photo-1614728263952-84ea206f0c4c?q=80&w=1200",
      gallery: [],
      videos: [],
    },
    reviews: [],
    totalPositiveReviews: 0,
    totalNegativeReviews: 0,
  })),
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
