import { NextRequest } from "next/server";

import handler, {
  loadFirstImageData,
  loadImageData,
  outletAvatarCandidates,
  publishedStoreFromResponse,
  publishedSelectionFromResponse,
  loadOutletPreview,
} from "pages/api/og/[...segments]";
import { selectionFixture } from "tests/unit/_fixtures/selection";
// Keep Jest's unit layer independent of next/og's dynamic WASM import.
// The visual fixture runner separately exercises the real PNG renderer.
jest.mock("next/og", () => ({
  ImageResponse: jest.fn(
    (card, options) =>
      new Response(
        jest.requireActual("react-dom/server").renderToStaticMarkup(card),
        {
          headers: options.headers,
        },
      ),
  ),
}));

const ORIGIN = "https://www.manifoldpowered.com";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);

function imageResponse(contentType: string, bytes: Uint8Array): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, { headers: { "content-type": contentType } });
}

function logoRequest(outlet: { slug: string; logo_url: string | null }) {
  return `${ORIGIN}/api/outlet-logo/${outlet.slug}?source=${encodeURIComponent(outlet.logo_url!)}`;
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

describe("selection social preview privacy", () => {
  test.each(
    ["outlet", "selection"].flatMap((kind) =>
      [
        "https://yt3.googleusercontent.com/public-avatar=s900-c-k",
        "https://pbs.twimg.com/profile_images/example/avatar.png",
        "https://community.example/logo.png",
      ].map((logo) => [kind, logo]),
    ),
  )(
    "renders the published community logo in the %s preview from %s",
    async (kind, logo) => {
      const data = selectionFixture();
      data.outlet.name = "Comunidade Exemplo";
      data.outlet.logo_url = logo;
      const store = publishedStore({
        slug: data.outlet.slug,
        name: data.outlet.name,
        logo_url: data.outlet.logo_url,
      });
      const fetchMock = jest
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input) => {
          const url = String(input);
          if (url.includes("/selections/")) return Response.json(data);
          if (url.endsWith("/api/v1/stores/example-outlet"))
            return Response.json(store);
          if (url === logoRequest(data.outlet))
            return imageResponse("image/png", PNG_BYTES);
          return new Response(null, { status: 404 });
        });
      const path =
        kind === "outlet"
          ? "outlet/example-outlet"
          : "selection/example-outlet/weekend-coop";
      const response = await handler(
        new NextRequest(`${ORIGIN}/api/og/${path}?locale=pt-BR`),
      );
      expect(response.status).toBe(200);
      const markup = await response.text();
      if (kind === "selection")
        expect(markup).toContain('alt="Comunidade Exemplo"');
      expect(markup).toContain("data:image/png;base64,");
      expect(markup).not.toContain(">CE</div>");
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === logoRequest(data.outlet),
        ),
      ).toBe(true);
      for (const [, init] of fetchMock.mock.calls)
        expect(init?.headers ?? {}).not.toHaveProperty("cookie");
    },
  );
  test("composes the published Outlet palette and avatar, and revalidates identity changes", async () => {
    const data = selectionFixture();
    data.outlet.name = "Comunidade Nintendo";
    data.selection.title = "Lançamentos da semana (19/10/2026)";
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url).includes("/selections/"))
          return new Response(JSON.stringify(data));
        if (String(url) === logoRequest(data.outlet))
          return imageResponse("image/png", PNG_BYTES);
        return new Response(null, { status: 404 });
      });
    const request = new NextRequest(
      `${ORIGIN}/api/og/selection/example-outlet/weekend-coop?preview=1&locale=pt-BR`,
      { headers: { cookie: "session_id=private-session" } },
    );
    const response = await handler(request);
    expect(response.status).toBe(200);
    const markup = await response.text();
    expect(markup).toContain("background:#E60013");
    expect(markup).toContain('alt="Comunidade Nintendo"');
    expect(markup).toContain("via Manifold");
    expect(markup).not.toContain("MANIFOLD");
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url) === logoRequest(data.outlet),
      ),
    ).toBe(true);
    for (const [, init] of fetchMock.mock.calls)
      expect(init?.headers ?? {}).not.toHaveProperty("cookie");

    const etag = response.headers.get("etag")!;
    const cachedRequest = new NextRequest(request.url, {
      headers: { "if-none-match": etag },
    });
    expect((await handler(cachedRequest)).status).toBe(304);
    data.outlet.brand_tokens = {
      palette: "ocean",
      typography: "modern",
      shape: "soft",
    };
    const recolored = await handler(cachedRequest);
    expect(recolored.status).toBe(200);
    expect(recolored.headers.get("etag")).not.toBe(etag);
    data.outlet.logo_url = null;
    const withoutAvatar = await handler(new NextRequest(request.url));
    expect(withoutAvatar.headers.get("etag")).not.toBe(
      recolored.headers.get("etag"),
    );
    expect(await withoutAvatar.text()).toContain(">CN</div>");
  });

  test("accepts a published snapshot but refuses draft content or unpublished state", () => {
    const data = selectionFixture();
    expect(publishedSelectionFromResponse(data)).toEqual(data);
    expect(
      publishedSelectionFromResponse({
        ...data,
        selection: { ...data.selection, draft_revision: 7 },
      }),
    ).toBeNull();
    expect(
      publishedSelectionFromResponse({
        ...data,
        selection: { ...data.selection, status: "DRAFT" },
      }),
    ).toBeNull();
    expect(
      publishedSelectionFromResponse({
        ...data,
        selection: { ...data.selection, published_at: null },
      }),
    ).toBeNull();
  });
  test("does not forward preview flags or the request's session to the content API", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 404 }));
    const result = await handler(
      new NextRequest(
        `${ORIGIN}/api/og/selection/example-outlet/weekend-coop?preview=1&locale=pt-BR`,
        { headers: { cookie: "session_id=private-session" } },
      ),
    );
    expect(result.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toEqual(
      new URL(
        `${ORIGIN}/api/v1/stores/example-outlet/selections/weekend-coop?locale=pt-BR&social_preview=1`,
      ),
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { accept: "application/json" },
    });
  });
});

describe("OG image loading", () => {
  test.each(["yt3.googleusercontent.com", "yt3.ggpht.com"])(
    "loads public channel avatars from %s",
    async (host) => {
      jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(imageResponse("image/png", PNG_BYTES));
      await expect(
        loadImageData(`https://${host}/public-avatar=s900-c-k`, ORIGIN),
      ).resolves.toMatch(/^data:image\/png/);
    },
  );
  test.each([
    "https://yt3.googleusercontent.com.attacker.example/avatar.png",
    "https://yt3.googleusercontent.com@127.0.0.1/avatar.png",
    "http://yt3.googleusercontent.com/avatar.png",
    "https://yt3.googleusercontent.com:8443/avatar.png",
  ])("rejects unsafe avatar origins: %s", async (url) => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expect(loadImageData(url, ORIGIN)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  test("accepts the public PNG avatar service but not its SVG or other routes", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => imageResponse("image/png", PNG_BYTES));
    await expect(
      loadImageData(
        "https://api.dicebear.com/9.x/bottts-neutral/png?seed=PublicClub&size=256",
        ORIGIN,
      ),
    ).resolves.toMatch(/^data:image\/png/);
    await expect(
      loadImageData(
        "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=PublicClub",
        ORIGIN,
      ),
    ).resolves.toBeNull();
    await expect(
      loadImageData("https://api.dicebear.com/private", ORIGIN),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
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

  test.each([
    "/api/og/selection/reviewer/self-reference",
    "/api/og/outlet/reviewer",
    "/api/outlet-logo/reviewer?source=https://internal.example/image.png",
    "/api/v1/stores/reviewer/selections/private?preview=1",
    "/_next/image?url=%2Fapi%2Fog%2Fselection%2Freviewer%2Fself-reference&w=1200&q=75",
    "/store/reviewer/selections/weekend",
    "/%61pi/og/selection/reviewer/self-reference",
    "/api%2Fog%2Fselection%2Freviewer%2Fself-reference",
    "/images/../api/og/selection/reviewer/self-reference",
    "/images/%2e%2e/api/og/selection/reviewer/self-reference",
    "/images/%2e%2e%2fapi%2fog%2fselection%2freviewer%2fself-reference",
    "/images/%252e%252e%252fapi%252fog%252fselection%252freviewer%252fself-reference",
    "/images/%2e%2e%5capi/og/selection/reviewer/self-reference",
    "/storefronts/%2e%2e%2fapi%2fog%2fselection%2freviewer%2fself-reference",
    "/images/brand/manifold-logo.png?url=/api/og/selection/reviewer/self-reference",
  ])(
    "rejects same-origin dynamic and encoded image routes before fetching: %s",
    async (path) => {
      const fetchMock = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(imageResponse("image/png", PNG_BYTES));
      await expect(
        loadImageData(`${ORIGIN}${path}`, ORIGIN),
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test.each([
    "/images/brand/manifold-logo.png",
    "/images/social/home-catalog/twisted-tower.jpg",
    "/storefronts/strategos-void/logo.jpg",
  ])("retains absolute HTTPS public static artwork: %s", async (path) => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(imageResponse("image/png", PNG_BYTES));
    await expect(loadImageData(`${ORIGIN}${path}`, ORIGIN)).resolves.toMatch(
      /^data:image\/png;base64,/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`${ORIGIN}${path}`),
      expect.objectContaining({ redirect: "manual" }),
    );
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
  test("retries a publication race without mixing identity and draft or automatic games", async () => {
    const first = publishedStore({ published_revision: { revision: 1 } });
    const second = publishedStore({
      name: "New Published Name",
      published_revision: { revision: 2 },
    });
    const featured = {
      publication: {
        slug: first.slug,
        revision: 2,
        published_at: first.published_at,
      },
      games: [
        {
          slug: "picked",
          title: "Picked",
          media: { banner: "https://images.unsplash.com/game.jpg" },
          featured_source: "EDITORIAL",
        },
        {
          slug: "auto",
          title: "Auto",
          media: { banner: "https://images.unsplash.com/auto.jpg" },
          featured_source: "AUTOMATIC",
        },
      ],
    };
    const fetchMock = jest.spyOn(globalThis, "fetch");
    for (const body of [first, featured, second, featured])
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    const result = await loadOutletPreview(ORIGIN, first.slug, "pt-BR");
    expect(result?.store.name).toBe("New Published Name");
    expect(result?.games.map((g) => g.slug)).toEqual(["picked"]);
    const requests = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requests.filter((url) => url.includes("/featured"))).toEqual([
      `${ORIGIN}/api/v1/stores/${first.slug}/featured?locale=pt-BR&social_preview=1`,
      `${ORIGIN}/api/v1/stores/${first.slug}/featured?locale=pt-BR&social_preview=1`,
    ]);
    for (const [, init] of fetchMock.mock.calls)
      expect(init.headers).toEqual({ accept: "application/json" });
  });

  test("falls back to identity on an inconsistent feed and stops if the Outlet is unpublished", async () => {
    const store = publishedStore({ published_revision: { revision: 1 } });
    const fetchMock = jest.spyOn(globalThis, "fetch");
    for (const body of [store, {}, store, {}, store])
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    expect((await loadOutletPreview(ORIGIN, store.slug, "en"))?.games).toEqual(
      [],
    );
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(store)))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect(await loadOutletPreview(ORIGIN, store.slug, "en")).toBeNull();
  });
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

  test("uses the published logo for a retired theme, never an Outlet cover", () => {
    expect(
      outletAvatarCandidates(
        publishedStore({
          presentation: {
            ...publishedStore().presentation,
            theme_key: "strategos-void",
          },
        }),
      ),
    ).toEqual([
      {
        url: "/api/outlet-logo/published-outlet?source=https%3A%2F%2Fimages.unsplash.com%2Flogo.png",
        trustedInternalAsset: true,
      },
    ]);

    // A creator cannot obtain bespoke presentation by choosing its public slug.
    expect(
      outletAvatarCandidates(
        publishedStore({
          slug: "strategos-void",
          presentation: {
            ...publishedStore().presentation,
            theme_key: null,
          },
        }),
      ),
    ).toEqual([
      {
        url: "/api/outlet-logo/strategos-void?source=https%3A%2F%2Fimages.unsplash.com%2Flogo.png",
        trustedInternalAsset: true,
      },
    ]);
  });
});
