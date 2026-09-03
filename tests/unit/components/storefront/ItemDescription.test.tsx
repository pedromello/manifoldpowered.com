import { renderToStaticMarkup } from "react-dom/server";

import { ItemDescription } from "components/storefront/default/item/ItemDescription";
import type { GameDetailApi } from "components/store/types";

jest.mock("components/store/MediaGallery", () => ({
  MediaGallery: () => <div data-gallery="true" />,
}));
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <>{children}</>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("rehype-raw", () => ({ __esModule: true, default: jest.fn() }));

const game: GameDetailApi = {
  id: "game-1",
  slug: "signal-garden",
  title: "Signal Garden",
  description: "Official short copy.",
  detailed_description: "Official studio description.",
  launch_date: "2026-09-01T00:00:00.000Z",
  price: "10.00",
  developer_name: "Studio",
  tags: [],
  media: { screenshots: [], videos: [] },
  purchase_mode: "PLATFORM",
  external_offer: null,
  meta_tags: {},
  social_links: {},
};

const store = {
  id: "store-1",
  slug: "signal-boost",
  name: "Signal Boost",
  description: null,
  logo_url: null,
  theme_key: null,
  layout_preset: "channel" as const,
  tagline: null,
  cover_url: null,
  social_links: {},
  brand_tokens: {
    palette: "manifold" as const,
    typography: "modern" as const,
    shape: "soft" as const,
  },
  presentation: undefined,
};

describe("ItemDescription Outlet context", () => {
  test("places the Outlet review before the official studio description", () => {
    const markup = renderToStaticMarkup(
      <ItemDescription
        game={game}
        store={store}
        outletReview={{
          headline: "A creator headline",
          body: "A creator-specific point of view.",
        }}
      />,
    );

    expect(markup).toContain("The view from Signal Boost");
    expect(markup).toContain("A creator headline");
    expect(markup).toContain("A creator-specific point of view.");
    expect(markup).toContain("About the game");
    expect(markup.indexOf("A creator-specific point of view.")).toBeLessThan(
      markup.indexOf("Official studio description."),
    );
  });

  test("keeps the original page when there is no contextual review", () => {
    const markup = renderToStaticMarkup(<ItemDescription game={game} />);

    expect(markup).not.toContain("The view from");
    expect(markup).not.toContain("About the game");
    expect(markup).toContain("Official studio description.");
  });
});
