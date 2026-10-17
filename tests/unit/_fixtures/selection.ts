import type { SelectionPageApi } from "lib/selection-client";
export function selectionFixture(): SelectionPageApi {
  return {
    selection: {
      id: "selection-id",
      slug: "weekend-coop",
      title: "Weekend co-op",
      description: "A thoughtful selection for playing with friends.",
      cover_url: "https://images.unsplash.com/selection.jpg",
      image_urls: [],
      game_slugs: ["peak"],
      status: "PUBLISHED",
      published_revision: 1,
      published_at: "2026-10-16T12:00:00.000Z",
      public_path: "/store/example-outlet/selections/weekend-coop",
    },
    outlet: {
      id: "outlet-id",
      slug: "example-outlet",
      name: "Example Outlet",
      logo_url: "https://images.unsplash.com/avatar.png",
    },
    games: [
      {
        id: "game-id",
        slug: "peak",
        title: "PEAK",
        description: "Climb together.",
        detailed_description: "Climb together.",
        launch_date: null,
        price: null,
        developer_name: "Example Studio",
        tags: ["Co-op"],
        media: {
          banner: "https://shared.fastly.steamstatic.com/peak.jpg",
          screenshots: [],
          videos: [],
        },
        purchase_mode: "UNAVAILABLE",
        external_offer: null,
        recommendation_reason: "A small adventure for a group of friends.",
      },
    ],
    currency: "USD",
  };
}
