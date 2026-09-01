import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  OutletCustomizationForm,
  publishOutletDraftRequest,
  retryPublicationReadiness,
  saveOutletDraftRequest,
} from "components/store/OutletCustomizationForm";
import type { StoreManagementApi } from "components/store/types";

type MockLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: unknown;
};

const mockUseSWR = jest.fn();
const mockMutatePublication = jest.fn();
const mockGlobalMutate = jest.fn();

jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseSWR(...args),
  useSWRConfig: () => ({ mutate: mockGlobalMutate }),
}));

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
    status: "DRAFT",
    published_at: null,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    draft_revision: 2,
    ...overrides,
  };
}

describe("OutletCustomizationForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSWR.mockReturnValue({
      data: {
        status: "DRAFT",
        published_at: null,
        draft_revision: 2,
        published_revision: null,
        readiness: {
          ready: false,
          catalog_game_count: 0,
          checks: {
            brand_complete: false,
            visual_identity: false,
            catalog_intentional: false,
            catalog_has_games: false,
            editorial_highlight: false,
          },
        },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: mockMutatePublication,
    });
  });

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
      'Complete identity<span class="sr-only">: Incomplete',
    );
    expect(markup).toContain(
      'Selection strategy<span class="sr-only">: Incomplete',
    );
    expect(markup).toContain('Visual layout<span class="sr-only">: Incomplete');
    expect(markup).toContain('href="/store/lantern-club?preview=1"');
    expect(markup).toContain(
      'src="/store/lantern-club?preview=1&amp;revision=0"',
    );
    expect(markup).not.toContain("View live");
    expect(markup).toContain("motion-reduce:transition-none");
  });

  test("keeps live and draft preview destinations separate after publication", () => {
    mockUseSWR.mockReturnValue({
      data: {
        status: "PUBLISHED",
        published_at: "2026-09-01T12:30:00.000Z",
        draft_revision: 2,
        published_revision: { source_draft_revision: 2 },
        readiness: {
          ready: true,
          catalog_game_count: 5,
          checks: {
            brand_complete: true,
            visual_identity: true,
            catalog_intentional: true,
            catalog_has_games: true,
            editorial_highlight: true,
          },
        },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: mockMutatePublication,
    });
    const markup = renderToStaticMarkup(
      <OutletCustomizationForm
        store={store({
          layout_preset: "channel",
          status: "PUBLISHED",
          published_at: "2026-09-01T12:30:00.000Z",
        })}
      />,
    );

    expect(markup).toContain('href="/store/lantern-club"');
    expect(markup).toContain("View live");
    expect(markup).toContain('href="/store/lantern-club?preview=1"');
    expect(markup).toContain("Open preview");
  });

  test("renders accessible loading and publication-disabled explanations", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: true,
      mutate: mockMutatePublication,
    });

    const markup = renderToStaticMarkup(
      <OutletCustomizationForm store={store()} />,
    );

    expect(markup).toContain('role="status" aria-live="polite"');
    expect(markup).toContain("Loading publication readiness...");
    expect(markup).toContain('aria-describedby="publication-action-status"');
    expect(markup).toContain(
      "Publishing is disabled while readiness is loading.",
    );
  });

  test("renders an accessible readiness error with a retry action", async () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("offline"),
      isLoading: false,
      isValidating: false,
      mutate: mockMutatePublication,
    });

    const markup = renderToStaticMarkup(
      <OutletCustomizationForm store={store()} />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Publication readiness unavailable");
    expect(markup).toContain("Try again");
    expect(markup).toContain(
      "Publishing is disabled because readiness could not be loaded.",
    );

    await retryPublicationReadiness(mockMutatePublication);
    expect(mockMutatePublication).toHaveBeenCalledTimes(1);
  });

  test("marks a newly selected preset and keeps preview on the private route", () => {
    const markup = renderToStaticMarkup(
      <OutletCustomizationForm store={store({ layout_preset: "editorial" })} />,
    );
    const editorial = markup.indexOf("Editorial / Curation");
    const radio = markup.lastIndexOf('role="radio"', editorial);

    expect(markup.slice(radio, editorial)).toContain('aria-checked="true"');
    expect(markup).toContain('href="/store/lantern-club?preview=1"');
  });

  test("explains and disables bespoke-only controls without hiding useful identity", () => {
    const markup = renderToStaticMarkup(
      <OutletCustomizationForm
        store={store({ theme_key: "neon-alley", layout_preset: null })}
      />,
    );

    expect(markup).toContain(
      "This custom storefront uses artwork and social destinations maintained by Manifold.",
    );
    expect(markup).toContain(
      "Social destinations for this custom storefront are maintained by Manifold.",
    );
    expect(markup).toMatch(
      /<fieldset[^>]*disabled=""[^>]*>[\s\S]*Social links/,
    );
    expect(markup).toMatch(/Cover URL[\s\S]*?<input[^>]*disabled=""/);
    const outletNameStart = markup.indexOf("Outlet name");
    const outletNameField = markup.slice(
      outletNameStart,
      markup.indexOf("</label>", outletNameStart),
    );
    expect(outletNameField).not.toContain('disabled=""');
  });
});

describe("Outlet editor mutation contracts", () => {
  test("saves the selected preset with If-Match and exposes a CAS conflict", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "stale draft" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const result = await saveOutletDraftRequest({
      slug: "lantern-club",
      draftRevision: 7,
      payload: { layout_preset: "editorial" },
      fetcher,
    });

    expect(result.response.status).toBe(409);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/stores/lantern-club",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "If-Match": '"7"' }),
        body: JSON.stringify({ layout_preset: "editorial" }),
      }),
    );
  });

  test("publishes with the exact expected draft revision", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "PUBLISHED" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await publishOutletDraftRequest({
      slug: "lantern-club",
      draftRevision: 9,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/stores/lantern-club/publication",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "publish",
          expected_draft_revision: 9,
        }),
      }),
    );
  });
});
