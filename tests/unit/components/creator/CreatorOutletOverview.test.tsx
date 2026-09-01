import { renderToStaticMarkup } from "react-dom/server";

import {
  CreatorOutletOverview,
  type CreatorOutletOverviewProps,
} from "components/creator/CreatorOutletOverview";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

function props(
  overrides: Partial<CreatorOutletOverviewProps> = {},
): CreatorOutletOverviewProps {
  return {
    store: {
      slug: "criadora-indie",
      name: "Criadora Indie",
      description: "Jogos escolhidos com um olhar muito pessoal.",
      logo_url: null,
      status: "DRAFT",
    },
    publication: {
      status: "DRAFT",
      publishedAt: null,
      ready: false,
      checks: {
        brand_complete: false,
        catalog_curated: false,
        catalog_has_games: false,
        editorial_highlight: false,
      },
    },
    ...overrides,
  };
}

describe("CreatorOutletOverview", () => {
  test("renders the server checklist and chooses only its first blocker as the primary action", () => {
    const markup = renderToStaticMarkup(<CreatorOutletOverview {...props()} />);

    expect(markup.match(/data-creator-primary-action=/g)).toHaveLength(1);
    expect(markup).toContain('data-creator-primary-action="identity"');
    expect(markup.match(/data-readiness-check=/g)).toHaveLength(4);
    expect(markup).toContain('data-readiness-check="brand_complete"');
    expect(markup).toContain('data-readiness-check="catalog_curated"');
    expect(markup).toContain('data-readiness-check="catalog_has_games"');
    expect(markup).toContain('data-readiness-check="editorial_highlight"');
    expect(markup).toContain("Continue building");
    expect(markup).not.toContain("View live");
    expect(markup).not.toContain("Publish Outlet");
  });

  test("asks for a preview before offering publication", () => {
    const publication = {
      status: "DRAFT" as const,
      publishedAt: null,
      ready: true,
      checks: {
        brand_complete: true,
        catalog_curated: true,
        catalog_has_games: true,
        editorial_highlight: true,
      },
    };
    const beforePreview = renderToStaticMarkup(
      <CreatorOutletOverview {...props({ publication })} />,
    );
    const afterPreview = renderToStaticMarkup(
      <CreatorOutletOverview
        {...props({
          publication,
          previewedAt: "2026-09-01T12:00:00.000Z",
          onPublish: jest.fn(),
        })}
      />,
    );

    expect(beforePreview).toContain('data-creator-primary-action="preview"');
    expect(beforePreview).not.toContain("Publish Outlet");
    expect(afterPreview).toContain('data-creator-primary-action="publish"');
    expect(afterPreview).toContain("Publish Outlet");
    expect(afterPreview).not.toContain("View live");
  });

  test("uses live language only after the server reports publication", () => {
    const markup = renderToStaticMarkup(
      <CreatorOutletOverview
        {...props({
          store: {
            ...props().store,
            status: "PUBLISHED",
          },
          publication: {
            status: "PUBLISHED",
            publishedAt: "2026-09-01T12:00:00.000Z",
            ready: true,
            checks: {
              brand_complete: true,
              catalog_curated: true,
              catalog_has_games: true,
              editorial_highlight: true,
            },
          },
        })}
      />,
    );

    expect(markup).toContain('data-creator-primary-action="share"');
    expect(markup).toContain("Published");
    expect(markup).toContain("Copy Outlet link");
    expect(markup).toContain("View live");
    expect(markup).not.toContain("Preview is private");
    expect(markup).not.toContain("Publish Outlet");
    expect(markup).not.toContain("Preview is private");
  });

  test("refreshes instead of publishing when the server has not marked a complete checklist ready", () => {
    const markup = renderToStaticMarkup(
      <CreatorOutletOverview
        {...props({
          retry: jest.fn(),
          publication: {
            status: "DRAFT",
            publishedAt: null,
            ready: false,
            checks: {
              brand_complete: true,
              catalog_curated: true,
              catalog_has_games: true,
              editorial_highlight: true,
            },
          },
        })}
      />,
    );

    expect(markup).toContain('data-creator-primary-action="refresh"');
    expect(markup).toContain("Refresh status");
    expect(markup).not.toContain("Publish Outlet");
  });

  test("announces publication in progress and prevents another submission", () => {
    const markup = renderToStaticMarkup(
      <CreatorOutletOverview
        {...props({
          publication: {
            status: "DRAFT",
            publishedAt: null,
            ready: true,
            checks: {
              brand_complete: true,
              catalog_curated: true,
              catalog_has_games: true,
              editorial_highlight: true,
            },
          },
          previewedAt: "2026-09-01T12:00:00.000Z",
          onPublish: jest.fn(),
          isPublishing: true,
        })}
      />,
    );

    expect(markup).toContain('data-creator-primary-action="publish"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Publishing...");
    expect(markup).toContain("disabled");
  });

  test("shows an accessible retry state without inventing lifecycle data", () => {
    const markup = renderToStaticMarkup(
      <CreatorOutletOverview
        {...props({
          publication: null,
          error: "Publication request failed",
          retry: jest.fn(),
        })}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Publication request failed");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("data-readiness-check");
    expect(markup).not.toContain("data-creator-primary-action");
  });
});
