import type { GetServerSidePropsContext } from "next";
import { getServerSideProps as getItemProps } from "pages/item/[slug]";
import { getServerSideProps as getOutletProps } from "pages/store/[slug]";
import { fetchPageData } from "lib/page-data";

jest.mock("lib/page-data", () => ({ fetchPageData: jest.fn() }));
jest.mock("components/storefront/default/item/DefaultItemPage", () => ({
  DefaultItemPage: () => null,
}));
jest.mock("storefronts/registry", () => ({ resolveStorefront: jest.fn() }));

const outlet = {
  id: "outlet-1",
  slug: "lantern-club",
  name: "Lantern Club",
  status: "PUBLISHED",
  published_revision: { id: "revision-1" },
};
const game = { id: "game-1", slug: "signal-garden", title: "Signal Garden" };
const link = {
  id: "affiliate-1",
  url: "https://www.nuuvem.com/br-pt/item/signal-garden",
  kind: "game",
};
const response = (payload: unknown) =>
  ({ ok: true, json: async () => payload }) as Response;
function context(query: Record<string, string>) {
  return {
    query,
    req: { headers: { cookie: "session_id=synthetic" } },
    res: { setHeader: jest.fn(), getHeader: jest.fn() },
    locale: "pt-BR",
  } as unknown as GetServerSidePropsContext;
}

beforeEach(() => {
  jest.mocked(fetchPageData).mockReset();
  jest
    .mocked(fetchPageData)
    .mockImplementation(async (url) =>
      String(url).includes("/items/games/") ? { ...game } : { ...outlet },
    );
  global.fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.includes("/affiliate-links"))
      return response({ links: [link], published_revision_id: "revision-1" });
    if (url.includes("/game-editorials/")) return response({ review: null });
    return response({ ...outlet });
  });
});

afterEach(() => jest.restoreAllMocks());

test("a direct game visit has no affiliate request or attributed options", async () => {
  const result = await getItemProps(context({ slug: game.slug }));
  expect(result).toEqual({
    props: expect.objectContaining({
      store: null,
      affiliateLinks: [],
      affiliateRevisionId: null,
    }),
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("an attributed game resolves options for its validated Outlet and preserves the revision", async () => {
  const result = await getItemProps(
    context({ slug: game.slug, store: outlet.slug }),
  );
  expect(result).toEqual({
    props: expect.objectContaining({
      store: outlet,
      affiliateLinks: [link],
      affiliateRevisionId: "revision-1",
    }),
  });
  expect(global.fetch).toHaveBeenCalledWith(
    expect.objectContaining({ search: "?game_slug=signal-garden" }),
    expect.objectContaining({ headers: expect.anything() }),
  );
});

test("an unavailable affiliate endpoint leaves the official game and Outlet intact", async () => {
  const original = global.fetch;
  global.fetch = jest.fn(async (input, init) => {
    if (String(input).includes("/affiliate-links")) throw new Error("Offline");
    return original(input, init);
  });
  const result = await getItemProps(
    context({ slug: game.slug, store: outlet.slug }),
  );
  expect(result).toEqual({
    props: expect.objectContaining({ game, store: outlet, affiliateLinks: [] }),
  });
});

test("the Outlet SSR sends only its general link collection into the shared view context", async () => {
  const result = await getOutletProps(context({ slug: outlet.slug }));
  expect(result).toEqual({
    props: {
      store: expect.objectContaining({
        affiliate_links: [link],
        affiliate_revision_id: "revision-1",
      }),
      isPreview: false,
    },
  });
  expect(global.fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: `/api/v1/stores/${outlet.slug}/affiliate-links`,
      search: "",
    }),
    expect.anything(),
  );
});

test("a republish between the identity and affiliate reads does not mix revisions", async () => {
  global.fetch = jest.fn(async () =>
    response({ links: [link], published_revision_id: "newer-revision" }),
  );
  const result = await getOutletProps(context({ slug: outlet.slug }));
  expect(result).toEqual({ props: { store: outlet, isPreview: false } });
});
