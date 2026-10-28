import { getServerSideProps } from "pages/store";
import { selectionFixture } from "tests/unit/_fixtures/selection";
jest.mock("infra/webserver", () => ({
  __esModule: true,
  default: { getOrigin: () => "http://localhost:3000" },
}));
function context() {
  return {
    locale: "pt-BR",
    req: {
      headers: { cookie: "session_id=test", "x-vercel-ip-country": "BR" },
    },
    res: { setHeader: jest.fn() },
  };
}
afterEach(() => jest.restoreAllMocks());
test("SSR loads resolved home in the visitor's session, region and language", async () => {
  const selections = [selectionFixture()];
  const fetcher = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ mode: "manual", selections, communities: [] }),
      ),
    );
  const ctx = context();
  expect(await getServerSideProps(ctx as never)).toEqual({
    props: { editorialSelections: selections, homeCommunities: [] },
  });
  expect(fetcher.mock.calls[0][0]).toBe(
    "http://localhost:3000/api/v1/public/home?locale=pt-BR",
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    headers: expect.objectContaining({
      cookie: "session_id=test",
      "x-vercel-ip-country": "BR",
    }),
  });
  expect(ctx.res.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store",
  );
});
test("an editorial failure preserves catalog rendering", async () => {
  jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unavailable"));
  expect(await getServerSideProps(context() as never)).toEqual({
    props: { editorialSelections: [], homeCommunities: [] },
  });
});
