import { getServerSideProps } from "pages/store/[slug]/selections";

jest.mock("infra/webserver", () => ({
  __esModule: true,
  default: { getOrigin: () => "http://localhost:3000" },
}));
function context(query: Record<string, string> = {}) {
  return {
    params: { slug: "example-outlet" },
    query,
    locale: "pt-BR",
    req: {
      headers: { cookie: "session_id=test", "x-vercel-ip-country": "BR" },
    },
    res: {
      getHeader: jest.fn().mockReturnValue("Accept-Encoding"),
      setHeader: jest.fn(),
    },
  };
}
afterEach(() => jest.restoreAllMocks());

test("library SSR fetches scoped published data with filters, locale and regional headers", async () => {
  const store = { slug: "example-outlet", name: "Example" };
  const data = {
    selections: [],
    pagination: { page: 2, limit: 6, total: 8, pages: 2 },
  };
  const fetcher = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(String(url).includes("/selections?") ? data : store),
        ),
    );
  const result = await getServerSideProps(
    context({ q: "co-op", order: "title_asc", page: "2" }) as never,
  );
  expect(result).toEqual({
    props: {
      store,
      data,
      query: { q: "co-op", order: "title_asc", page: 2 },
      preview: false,
    },
  });
  expect(String(fetcher.mock.calls[1][0])).toContain(
    "q=co-op&order=title_asc&page=2&limit=6&locale=pt-BR",
  );
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    headers: expect.objectContaining({
      cookie: "session_id=test",
      "x-vercel-ip-country": "BR",
    }),
  });
});

test.each([401, 403, 404])(
  "unavailable library previews return404 and remain private (%s)",
  async (status) => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status }));
    const ctx = context({ preview: "1" });
    expect(await getServerSideProps(ctx as never)).toEqual({ notFound: true });
    expect(ctx.res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(ctx.res.setHeader).toHaveBeenCalledWith(
      "Vary",
      "Accept-Encoding, Cookie",
    );
    expect(ctx.res.setHeader).toHaveBeenCalledWith(
      "X-Robots-Tag",
      "noindex, nofollow",
    );
  },
);

test("stale page numbers redirect to the first filtered page", async () => {
  jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("/selections?")
              ? { selections: [], pagination: { pages: 1 } }
              : { slug: "example-outlet" },
          ),
        ),
    );
  expect(
    await getServerSideProps(context({ page: "9", q: "coop" }) as never),
  ).toEqual({
    redirect: {
      destination: "/pt-BR/store/example-outlet/selections?q=coop",
      permanent: false,
    },
  });
});
