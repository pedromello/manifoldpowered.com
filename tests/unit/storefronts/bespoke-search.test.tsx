import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { StorefrontViewProps } from "components/storefront/types";
import { NeonAlleyStorefront } from "storefronts/neon-alley/Storefront";
import { StrategosVoidStorefront } from "storefronts/strategos-void/Storefront";

jest.mock("next/form", () => ({
  __esModule: true,
  default: ({ children, action, ...props }: ComponentProps<"form">) => (
    <form action={action} {...props}>
      {children}
    </form>
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: ComponentProps<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock("components/storefront/useStorefrontExtras", () => ({
  useStorefrontTrending: () => ({ games: [], isLoading: false }),
}));

function props(): StorefrontViewProps {
  return {
    store: {
      id: "store-1",
      slug: "preview-outlet",
      name: "Preview Outlet",
      description: "A creator-led selection.",
      logo_url: "https://example.com/logo.png",
      theme_key: "neon-alley",
      layout_preset: null,
      tagline: "Worth your time.",
      cover_url: null,
      social_links: {},
      brand_tokens: {
        palette: "manifold",
        typography: "modern",
        shape: "soft",
      },
    },
    isPreview: true,
    followControl: <button>Draft</button>,
    featured: [],
    featuredMode: "AUTOMATIC",
    isFeaturedLoading: false,
    featuredError: false,
    retryFeatured: jest.fn(),
    games: [],
    isLoading: false,
    catalogError: false,
    retryCatalog: jest.fn(),
    currency: "USD",
    q: "strategy",
    setQuery: jest.fn(),
    activeCategory: "Strategy",
    setCategory: jest.fn(),
    tags: ["4X"],
    toggleTag: jest.fn(),
    order: "newest",
    setOrder: jest.fn(),
    page: 1,
    setPage: jest.fn(),
    categories: ["For You", "Strategy"],
    itemHref: (slug) => `/item/${slug}?store=preview-outlet&preview=1`,
    browseHref: () => "/store/preview-outlet?preview=1",
    searchAction: "/store/preview-outlet",
    searchHiddenFields: { preview: "1" },
  };
}

function previewSubmission(markup: string) {
  const form = markup.match(
    /<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/,
  );
  expect(form).not.toBeNull();
  const hiddenPreviewFields =
    form?.[2].match(/<input[^>]*name="preview"[^>]*value="1"[^>]*\/?>/g) ?? [];
  const query = new URLSearchParams(
    hiddenPreviewFields.map(() => ["preview", "1"]),
  );
  return { action: form?.[1], hiddenPreviewFields, query };
}

describe.each([
  ["Neon Alley", NeonAlleyStorefront],
  ["Strategos Void", StrategosVoidStorefront],
] as const)("%s bespoke search", (_name, Storefront) => {
  test("submits exactly one preview field and preserves preview=1", () => {
    const markup = renderToStaticMarkup(<Storefront {...props()} />);
    const submission = previewSubmission(markup);

    expect(submission.action).toBe("/store/preview-outlet");
    expect(submission.hiddenPreviewFields).toHaveLength(1);
    expect(submission.query.toString()).toBe("preview=1");
  });
});
