import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OutletCustomizationForm } from "components/store/OutletCustomizationForm";
import type { StoreManagementApi } from "components/store/types";

type MockLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: unknown;
};

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: MockLinkProps) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

function store(
  overrides: Partial<StoreManagementApi> = {},
): StoreManagementApi {
  return {
    id: "store-1",
    slug: "lantern-club",
    name: "Lantern Club",
    description: "A thoughtful catalog.",
    logo_url: "https://example.com/logo.png",
    theme_key: null,
    layout_preset: null,
    tagline: "Small worlds, bright ideas.",
    cover_url: "https://example.com/cover.jpg",
    social_links: {},
    brand_tokens: {
      palette: "manifold",
      typography: "modern",
      shape: "soft",
    },
    owner_id: "owner-1",
    publication_status: "DRAFT",
    published_at: null,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    draft_revision: 2,
    has_unpublished_changes: true,
    publication_readiness: {
      ready: false,
      blockers: ["CURATION_STRATEGY_REQUIRED", "FEATURED_REQUIRED"],
      checks: {
        identity_complete: true,
        strategy_chosen: false,
        strategy: "NONE",
        selected_games: 0,
        minimum_games: 5,
        featured_games: 0,
      },
    },
    ...overrides,
  };
}

describe("OutletCustomizationForm", () => {
  test("keeps a legacy null preset classic without silently selecting Channel", () => {
    const markup = renderToStaticMarkup(
      <OutletCustomizationForm store={store()} />,
    );

    expect(markup).toContain(
      "This Outlet keeps its classic layout until you choose and save one of the new layouts.",
    );
    const presetGroupStart = markup.indexOf('aria-labelledby="preset-heading"');
    const presetGroup = markup.slice(
      presetGroupStart,
      markup.indexOf("</fieldset>", presetGroupStart),
    );
    expect(presetGroup).toContain(
      'role="radio" aria-checked="false" tabindex="0"',
    );
    expect(presetGroup).not.toContain('role="radio" aria-checked="true"');
  });

  test("exposes APG tab semantics, readiness state, and a draft-only preview URL", () => {
    const markup = renderToStaticMarkup(
      <OutletCustomizationForm store={store()} />,
    );

    expect(markup).toContain(
      'role="tablist" aria-label="Preview viewport" aria-orientation="horizontal"',
    );
    expect(markup).toContain(
      'role="tab" aria-selected="true" aria-controls="outlet-preview-panel" tabindex="0"',
    );
    expect(markup).toContain(
      'role="tabpanel" aria-labelledby="preview-desktop-tab"',
    );
    expect(markup).toContain(
      'Complete identity<span class="sr-only">: Complete',
    );
    expect(markup).toContain(
      'Selection strategy<span class="sr-only">: Incomplete',
    );
    expect(markup).toContain('href="/store/lantern-club?preview=1"');
    expect(markup).toContain(
      'src="/store/lantern-club?preview=1&amp;revision=0"',
    );
    expect(markup).not.toContain("View live");
    expect(markup).toContain("motion-reduce:transition-none");
  });

  test("keeps live and draft preview destinations separate after publication", () => {
    const markup = renderToStaticMarkup(
      <OutletCustomizationForm
        store={store({
          layout_preset: "channel",
          publication_status: "PUBLISHED",
          published_at: "2026-09-01T12:30:00.000Z",
        })}
      />,
    );

    expect(markup).toContain('href="/store/lantern-club"');
    expect(markup).toContain("View live");
    expect(markup).toContain('href="/store/lantern-club?preview=1"');
    expect(markup).toContain("Open preview");
  });
});
