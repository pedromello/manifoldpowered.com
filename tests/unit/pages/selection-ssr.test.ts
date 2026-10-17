import { getServerSideProps } from "pages/store/[slug]/selections/[selectionSlug]";
import { selectionFixture } from "tests/unit/_fixtures/selection";

jest.mock("infra/webserver", () => ({
  __esModule: true,
  default: { getOrigin: () => "http://localhost:3000" },
}));

function context(preview = false) {
  return {
    params: { slug: "example-outlet", selectionSlug: "weekend-coop" },
    query: preview ? { preview: "1" } : {},
    locale: "pt-BR",
    req: {
      headers: {
        cookie: "session_id=test-session",
        "x-vercel-ip-country": "BR",
      },
    },
    res: { setHeader: jest.fn() },
  };
}
afterEach(() => jest.restoreAllMocks());
test("selection content is fetched before rendering and preserves locale and country", async () => {
  const data = selectionFixture();
  const fetcher = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(data)));
  const result = await getServerSideProps(context() as never);
  expect(result).toEqual({ props: { data, preview: false } });
  expect(fetcher.mock.calls[0][0]).toBe(
    "http://localhost:3000/api/v1/stores/example-outlet/selections/weekend-coop?locale=pt-BR",
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    headers: expect.objectContaining({ "x-vercel-ip-country": "BR" }),
  });
});
test("draft preview responses are private and excluded from indexing", async () => {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(selectionFixture())));
  const ctx = context(true);
  await getServerSideProps(ctx as never);
  expect(ctx.res.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store",
  );
  expect(ctx.res.setHeader).toHaveBeenCalledWith(
    "X-Robots-Tag",
    "noindex, nofollow",
  );
  expect(ctx.res.setHeader).toHaveBeenCalledWith("Vary", "Cookie");
});
test.each([401, 403, 404])(
  "unauthorized or missing selection pages return a real 404 (%s)",
  async (status) => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status }));
    await expect(getServerSideProps(context(true) as never)).resolves.toEqual({
      notFound: true,
    });
  },
);
