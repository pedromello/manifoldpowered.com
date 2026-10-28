import {
  composedPreviewHeaders,
  fitPreviewText,
  loadPreviewBanners,
  previewGames,
  publishedFeaturedGames,
} from "lib/social-preview";
import { socialPreviewRequest } from "lib/social-preview-request";
import type { NextApiRequest } from "next";
import type { StoreApi } from "components/store/types";

const game = (slug: string, source = "EDITORIAL") => ({
  slug,
  title: slug,
  media: { banner: `https://images.unsplash.com/${slug}.jpg` },
  featured_source: source,
});

test("only published editorial games enter an Outlet preview, in original order", () => {
  expect(
    previewGames(
      [
        game("auto", "AUTOMATIC"),
        game("b"),
        null,
        { slug: "bad" },
        game("a"),
        game("b"),
      ],
      true,
    ).map((g) => g.slug),
  ).toEqual(["b", "a"]);
  expect(previewGames([game("auto", "AUTOMATIC")]).map((g) => g.slug)).toEqual([
    "auto",
  ]);
});

test("rejects mismatched, unversioned or private Featured responses", () => {
  const store = {
    slug: "club",
    published_at: "2026-10-18T10:00:00Z",
    published_revision: { revision: 4 },
  } as StoreApi;
  const publication = {
    slug: store.slug,
    published_at: store.published_at,
    revision: 4,
  };
  expect(
    publishedFeaturedGames(
      { publication, games: [game("a"), game("auto", "AUTOMATIC")] },
      store,
    )?.map((g) => g.slug),
  ).toEqual(["a"]);
  expect(
    publishedFeaturedGames(
      { publication: { ...publication, revision: 5 }, games: [game("a")] },
      store,
    ),
  ).toBeNull();
  expect(
    publishedFeaturedGames(
      { publication: { ...publication, slug: "other" }, games: [game("a")] },
      store,
    ),
  ).toBeNull();
  expect(
    publishedFeaturedGames({ publication: null, games: [game("a")] }, store),
  ).toBeNull();
  expect(publishedFeaturedGames({ games: [game("a")] }, store)).toBeNull();
});

test("bad images fall through to later games with at most three simultaneous downloads", async () => {
  let active = 0,
    maximum = 0;
  const load = jest.fn(async (url: string) => {
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
    if (url.includes("/a.")) throw Error("offline");
    if (url.includes("/b.")) return null;
    return url;
  });
  const result = await loadPreviewBanners(
    previewGames(["a", "b", "c", "d", "e", "f", "g"].map((s) => game(s))),
    load,
  );
  expect(result.map((g) => g.slug)).toEqual(["c", "d", "e"]);
  expect(maximum).toBeLessThanOrEqual(3);
  expect(load).toHaveBeenCalledTimes(6);
});

test("a small selection never duplicates images to fill three slots", async () => {
  const result = await loadPreviewBanners(
    previewGames([game("a"), game("a")]),
    async () => "image",
  );
  expect(result.map((g) => g.slug)).toEqual(["a"]);
  expect(await loadPreviewBanners([], async () => "image")).toEqual([]);
});

test("the approved title is kept complete and long unspaced names stay bounded", () => {
  const title = "Turno da madrugada: bater ponto e voltar inteiro";
  const fitted = fitPreviewText(title, 531, 3, 43, 34);
  expect(fitted.lines.join(" ")).toBe(title);
  expect(fitted.lines.length).toBeLessThanOrEqual(3);
  const long = fitPreviewText("W".repeat(120), 760, 3, 72, 45, 182);
  expect(long.lines.length).toBeLessThanOrEqual(3);
  expect(long.fontSize * 1.12 * long.lines.length).toBeLessThanOrEqual(182);
  expect(long.lines.at(-1)).toMatch(/…$/);
  expect(fitPreviewText("", 500, 2, 32, 26).lines).toEqual([]);
});

test("cache is bounded and validators change with images, publication and language", async () => {
  const content = { title: "A", image: "one", revision: 1 };
  const first = await composedPreviewHeaders("selection", "en", content);
  expect(first["Cache-Control"]).not.toContain("immutable");
  expect((await composedPreviewHeaders("selection", "en", content)).ETag).toBe(
    first.ETag,
  );
  for (const changed of [
    { ...content, image: "two" },
    { ...content, revision: 2 },
  ]) {
    expect(
      (await composedPreviewHeaders("selection", "en", changed)).ETag,
    ).not.toBe(first.ETag);
  }
  expect(
    (await composedPreviewHeaders("selection", "pt-BR", content)).ETag,
  ).not.toBe(first.ETag);
});

test("social previews use a stable public region without mutating normal or private requests", () => {
  const req = {
    query: { locale: "pt-BR" },
    headers: { "x-vercel-ip-country": "BR" },
  } as unknown as NextApiRequest;
  expect(socialPreviewRequest(req)).toBe(req);
  const preview = {
    ...req,
    query: { ...req.query, social_preview: "1" },
  } as unknown as NextApiRequest;
  expect(socialPreviewRequest(preview).headers).toMatchObject({
    "x-vercel-ip-country": "US",
    "x-manifold-visitor-country": "US",
  });
  expect(preview.headers["x-vercel-ip-country"]).toBe("BR");
  const draft = {
    ...preview,
    query: { ...preview.query, preview: "1" },
  } as unknown as NextApiRequest;
  expect(socialPreviewRequest(draft)).toBe(draft);
});
