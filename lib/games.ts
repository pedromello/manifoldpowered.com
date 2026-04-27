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
    discord?: string;
  };
  media: {
    banner: string;
    gallery: string[]; // Links to images
    videos: string[]; // Links to video files/embeds
  };
  reviews: Review[];
  totalPositiveReviews: number;
  totalNegativeReviews: number;
  isDemo?: boolean;
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
    id: "2",
    title: "Mai: Child of Ages",
    description:
      "Travel through time and help Mai and her Grandfather uncover the mysteries of the world after the Last Great War. Explore the connections between ancient eras and dystopian futures in an adventure that blends thrilling combat with precision platforming.",
    launchDate: "Sep 18, 2025",
    about: "",
    currentPrice: "11.69",
    originalPrice: "14.99",
    discountLabel: "-22%",
    tags: ["Action", "Adventure", "Hack and Slash", "Time Travel", "Dark"],
    gradient: BRAND_GRADIENTS[1],
    developerName: "Chubby Pixel",
    metaTags: {
      singlePlayer: true,
      multiplayer: true,
      controllerCompatible: true,
      coopLocal: true,
      coopOnline: false,
    },
    socialLinks: {
      x: "https://x.com/ChubbyPixel",
      youtube: "https://www.youtube.com/@MalboM",
      steam: "https://store.steampowered.com/developer/ChubbyPixel",
    },
    media: {
      banner:
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/d9fccec466f2be94188c670aebbee96e58e152e0/header.jpg?t=1775572056",
      gallery: [
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/7956c6cf7720b3466a3f6b6e932c1df61873cdc0/ss_7956c6cf7720b3466a3f6b6e932c1df61873cdc0.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/3d4d541d618fe46c8fc62d087742ba9153df4ed3/ss_3d4d541d618fe46c8fc62d087742ba9153df4ed3.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/18da8c5c452082e969844d697b80721af68d8776/ss_18da8c5c452082e969844d697b80721af68d8776.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/e624182c630e09cf95611be47738477acd64cb1b/ss_e624182c630e09cf95611be47738477acd64cb1b.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/4b7678d20f7b7b04fbdd63f48eee7be4f68a0c95/ss_4b7678d20f7b7b04fbdd63f48eee7be4f68a0c95.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/357a53246050db1f4aee5c8019c0e3ee24d38426/ss_357a53246050db1f4aee5c8019c0e3ee24d38426.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/7cbd4d55180a3fc6888c6b8057e93c969e58f533/ss_7cbd4d55180a3fc6888c6b8057e93c969e58f533.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/8d139e514d6739e5e27f52958865417bf4d740b9/ss_8d139e514d6739e5e27f52958865417bf4d740b9.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/d1d9ec6c3cb3ced2213ed3eb90e29fd5d763e48c/ss_d1d9ec6c3cb3ced2213ed3eb90e29fd5d763e48c.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/ss_f48a2016463620752230d2225ea1f686c68a8af9.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/ss_c1a735179a328bec7ec79a0359c3aaefe5e8ecbc.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/54369531aea3cca74dde0a5817dbda87b31bb900/ss_54369531aea3cca74dde0a5817dbda87b31bb900.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/4a902bc23c91a70e262a94c87c6bdf4be4712b02/ss_4a902bc23c91a70e262a94c87c6bdf4be4712b02.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/2e35d66f63b2bdf020a2883822d5ce3fb8328135/ss_2e35d66f63b2bdf020a2883822d5ce3fb8328135.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/8f282fc1a7ab5a0d5355a5f5dff60c8f432f4a7d/ss_8f282fc1a7ab5a0d5355a5f5dff60c8f432f4a7d.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/9ac587d165e188d2ee924d4e0814596475a9f9e2/ss_9ac587d165e188d2ee924d4e0814596475a9f9e2.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/ss_afbf634897d0fc8747092b8ffdb17df6c0c1a0dc.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/d698f5d4ab69c6c7a1580a32e05e0a21d7380642/ss_d698f5d4ab69c6c7a1580a32e05e0a21d7380642.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/1af49621ade889498bea6c09d6c3f17c38115ab2/ss_1af49621ade889498bea6c09d6c3f17c38115ab2.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/bc05d70bde5729f8c919ced2af40b24fb1911d13/ss_bc05d70bde5729f8c919ced2af40b24fb1911d13.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/9b63b90e56b9d0b8927cac4339546914f5e629b6/ss_9b63b90e56b9d0b8927cac4339546914f5e629b6.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/ce46345cb8274b7a6111b31d604141fd1b8a5db5/ss_ce46345cb8274b7a6111b31d604141fd1b8a5db5.1920x1080.jpg?t=1775572056",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3499550/a7c2fd8eabb64950184b66200ce7beea8573c653/ss_a7c2fd8eabb64950184b66200ce7beea8573c653.1920x1080.jpg?t=1775572056",
      ],
      videos: [
        "https://www.youtube.com/watch?v=XaoJqPljos4",
        "https://www.youtube.com/watch?v=9tGQH3p0x-Q",
      ],
    },
    reviews: [],
    totalPositiveReviews: 30,
    totalNegativeReviews: 4,
    isDemo: true,
  },
  {
    id: "3",
    isDemo: true,
    title: "Capyvarias",
    description:
      "Capyvarias is an incremental colony game set in a cozy post-apocalyptic world. Start with just two capybaras and grow your colony one click at a time. Gather resources, assign tasks, expand your shelter, and unlock strange new technologies discovered by the smartest capybaras.",
    launchDate: "Apr 24, 2026",
    about: "",
    currentPrice: "4.49",
    originalPrice: "4.99",
    discountLabel: "-10%",
    tags: [
      "Incremental",
      "Clicker",
      "Cozy",
      "Casual",
      "Cute",
      "Management",
      "Cartoony",
    ],
    gradient: BRAND_GRADIENTS[2],
    developerName: "Piebox",
    metaTags: {
      singlePlayer: true,
      multiplayer: false,
      controllerCompatible: false,
      coopLocal: false,
      coopOnline: false,
    },
    socialLinks: {
      steam: "https://store.steampowered.com/developer/piebox",
      x: "https://x.com/KiraniPiebox",
      discord: "https://discord.gg/2AJq6bzH9A",
    },
    media: {
      banner:
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/f9467ac1893e1e937716cc3b49dce83ad51b295f/header.jpg?t=1777020702",
      gallery: [
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/590df5ff3340241d2c0a3de87a80b19571469e44/ss_590df5ff3340241d2c0a3de87a80b19571469e44.1920x1080.jpg?t=1777020702",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/297faca7a5aa10a89ed8934efdf704c998f39487/ss_297faca7a5aa10a89ed8934efdf704c998f39487.1920x1080.jpg?t=1777020702",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/54e11a0d3b454f08511b4b072c1f9dcd29695aa9/ss_54e11a0d3b454f08511b4b072c1f9dcd29695aa9.1920x1080.jpg?t=1777020702",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/89bce983b7c1164f34d1de78035572da2388f6ea/ss_89bce983b7c1164f34d1de78035572da2388f6ea.1920x1080.jpg?t=1777020702",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/e996813ff0ba2484924a78f960038a3812240568/ss_e996813ff0ba2484924a78f960038a3812240568.1920x1080.jpg?t=1777020702",
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4072340/3639b9c530fd7a2fd72baaf003ffba9ebdfdbcfd/ss_3639b9c530fd7a2fd72baaf003ffba9ebdfdbcfd.1920x1080.jpg?t=1777020702",
      ],
      videos: ["https://www.youtube.com/watch?v=INDFDH1MMjs"],
    },
    reviews: [],
    totalPositiveReviews: 12,
    totalNegativeReviews: 0,
  },
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
