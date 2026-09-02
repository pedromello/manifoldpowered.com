import { NextRequest } from "next/server";

import handler, {
  loadFirstImageData,
  loadImageData,
  outletArtworkCandidates,
  publishedStoreFromResponse,
} from "pages/api/og/[...segments]";

const ORIGIN = "https://www.manifoldpowered.com";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);

function imageResponse(contentType: string, bytes: Uint8Array): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, { headers: { "content-type": contentType } });
}

function publishedStore(overrides: Record<string, unknown> = {}) {
  const value = publishedStoreFromResponse({
    id: "store-1",
    slug: "published-outlet",
    name: "Published Outlet",
    description: "The public revision",
    logo_url: "https://images.unsplash.com/logo.png",
    presentation: {
      version: 1,
      theme_key: null,
      layout_preset: "channel",
      tagline: null,
      cover_image_url: "https://images.unsplash.com/cover.png",
      social_links: {},
      brand_tokens: {
        palette: "manifold",
        typography: "modern",
        shape: "soft",
      },
    },
    owner_id: "owner-1",
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:30:00.000Z",
    storefront_source: "REVISION",
    status: "PUBLISHED",
    published_at: "2026-09-01T12:30:00.000Z",
    ...overrides,
  });

  if (!value) throw new Error("Expected a published store fixture");
  return value;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("OG image loading", () => {
  test.each([
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ["image/png", PNG_BYTES],
    ["image/gif", new TextEncoder().encode("GIF89a")],
    [
      "image/webp",
      new Uint8Array([
        82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32,
      ]),
    ],
  ])("accepts a signature-matched %s image", async (contentType, bytes) => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(imageResponse(contentType, bytes));

    const result = await loadImageData(
      "https://images.unsplash.com/allowed",
      ORIGIN,
    );

    expect(result).toMatch(new RegExp(`^data:${contentType};base64,`));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://images.unsplash.com/allowed"),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  test.each([
    "http://images.unsplash.com/cover.png",
    "http://www.manifoldpowered.com/cover.png",
    "https://cdn.example.com/cover.png",
    "/api/private-image",
  ])("rejects an unsafe presentation URL before fetching: %s", async (url) => {
    const fetchMock = jest.spyOn(globalThis, "fetch");

    await expect(loadImageData(url, ORIGIN)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("allows only explicitly trusted root-relative assets on the HTTP dev origin", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(imageResponse("image/png", PNG_BYTES));

    await expect(
      loadImageData(
        "/images/brand/manifold-logo.png",
        "http://localhost:3000",
        true,
      ),
    ).resolves.toMatch(/^data:image\/png;base64,/);
    await expect(
      loadImageData(
        "http://localhost:3000/images/owner-controlled.png",
        "http://localhost:3000",
        true,
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("rejects redirects, SVG, and a spoofed raster content type", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://images.unsplash.com/redirected.png" },
        }),
      )
      .mockResolvedValueOnce(
        imageResponse(
          "image/svg+xml",
          new TextEncoder().encode(
            "<svg xmlns='http://www.w3.org/2000/svg'/>>",
          ),
        ),
      )
      .mockResolvedValueOnce(
        imageResponse("image/png", new TextEncoder().encode("not a png")),
      );

    await expect(
      loadImageData("https://images.unsplash.com/redirect", ORIGIN),
    ).resolves.toBeNull();
    await expect(
      loadImageData("https://images.unsplash.com/vector.svg", ORIGIN),
    ).resolves.toBeNull();
    await expect(
      loadImageData("https://images.unsplash.com/spoofed.png", ORIGIN),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("https://images.unsplash.com/redirect"),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  test("falls back from an unsafe cover to a valid logo", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        imageResponse(
          "image/svg+xml",
          new TextEncoder().encode(
            "<svg xmlns='http://www.w3.org/2000/svg'/>>",
          ),
        ),
      )
      .mockResolvedValueOnce(imageResponse("image/png", PNG_BYTES));

    const result = await loadFirstImageData(
      [
        { url: "https://images.unsplash.com/unsafe-cover.svg" },
        { url: "https://images.unsplash.com/safe-logo.png" },
      ],
      ORIGIN,
    );

    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://images.unsplash.com/unsafe-cover.svg",
      "https://images.unsplash.com/safe-logo.png",
    ]);
  });
});

describe("published Outlet OG presentation", () => {
  test("does not forward an authenticated OG preview request to the draft API", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          storefront_source: "DRAFT",
          published_at: null,
          name: "Private draft",
          presentation: {
            version: 1,
            theme_key: "strategos-void",
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    const response = await handler(
      new NextRequest(
        `${ORIGIN}/api/og/outlet/private-draft?locale=en&preview=1`,
        { headers: { cookie: "session_id=private" } },
      ),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${ORIGIN}/api/v1/stores/private-draft`,
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  });

  test("fails closed when the public payload is not a published revision", () => {
    expect(
      publishedStoreFromResponse({
        storefront_source: "DRAFT",
        published_at: "2026-09-01T12:30:00.000Z",
        presentation: { version: 1, theme_key: "strategos-void" },
      }),
    ).toBeNull();
    expect(
      publishedStoreFromResponse({
        storefront_source: "REVISION",
        published_at: null,
        presentation: { version: 1, theme_key: "strategos-void" },
      }),
    ).toBeNull();
    expect(
      publishedStoreFromResponse({
        ...publishedStore(),
        presentation: {
          ...publishedStore().presentation,
          cover_image_url: { draft: "https://images.unsplash.com/leak.png" },
        },
      }),
    ).toBeNull();
  });

  test("selects bespoke artwork only from a published registered theme key", () => {
    expect(
      outletArtworkCandidates(
        publishedStore({
          presentation: {
            ...publishedStore().presentation,
            theme_key: "strategos-void",
          },
        }),
      ),
    ).toEqual([
      {
        url: "/storefronts/strategos-void/logo.jpg",
        trustedInternalAsset: true,
      },
      { url: "https://images.unsplash.com/cover.png" },
      { url: "https://images.unsplash.com/logo.png" },
    ]);

    // A creator cannot obtain bespoke presentation by choosing its public slug.
    expect(
      outletArtworkCandidates(
        publishedStore({
          slug: "strategos-void",
          presentation: {
            ...publishedStore().presentation,
            theme_key: null,
          },
        }),
      ),
    ).toEqual([
      { url: "https://images.unsplash.com/cover.png" },
      { url: "https://images.unsplash.com/logo.png" },
    ]);
  });
});
