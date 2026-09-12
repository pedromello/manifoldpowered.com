import { fetchProduct, parseNintendoProduct } from "infra/nintendo";
import {
  bananzaHtml,
  bananzaExpectedMedia,
} from "tests/fixtures/nintendo-bananza";
import { preserveMissingVideos } from "models/external_import/persistence";
import { nintendoProductUrl, nintendoVideoPoster } from "lib/nintendo";
import { createNintendoStrategy } from "models/external_import/nintendo_strategy";
import { nintendoHtml } from "tests/fixtures/nintendo";
import type { ImportAudit } from "models/external_import/contracts";

const nsuid = "70010000003208";
const trailer = (name: string, id = nsuid) => ({
  resourceType: "video",
  publicId: `/store/software/switch/${id}/Video/${name}`,
});
async function snapshot(br: unknown[], us: unknown[], usId = nsuid) {
  const strategy = createNintendoStrategy({
    fetchProduct: async (_slug, country) =>
      parseNintendoProduct(
        nintendoHtml(country, {
          nsuid: country === "US" ? usId : nsuid,
          productGallery: country === "BR" ? br : us,
        }),
        nintendoProductUrl("test-knight-switch", country),
      ),
  });
  const audit: ImportAudit = {
    regionalOutcomes: {},
    failureOutcome: "SERVICE_ERROR",
  };
  return strategy.fetchSnapshot(
    strategy.parseReference(nintendoProductUrl("test-knight-switch", "BR")),
    audit,
  );
}

test("imports localized trailers, deduplicates and keeps images separate", async () => {
  const result = await snapshot(
    [
      trailer("pt-br"),
      trailer("pt-br"),
      {
        resourceType: "image",
        publicId: `store/software/switch/${nsuid}/screen`,
      },
    ],
    [trailer("english")],
  );
  expect(result.fields.media.videos).toEqual([
    `https://assets.nintendo.com/video/upload/store/software/switch/${nsuid}/Video/pt-br.mp4`,
  ]);
  expect(result.fields.media.screenshots).toHaveLength(1);
});
test("falls back to another region only for the same Nintendo product", async () => {
  expect(
    (await snapshot([], [trailer("english")])).fields.media.videos,
  ).toHaveLength(1);
  expect(
    (await snapshot([], [trailer("other", "70010000000001")], "70010000000001"))
      .fields.media.videos,
  ).toEqual([]);
});
test("does not invent a trailer when the product has none or accept foreign assets", async () => {
  expect(
    (
      await snapshot(
        [
          trailer("../unsafe"),
          trailer("wrong-game", "70010000000001"),
          {
            resourceType: "video",
            publicId: "https://example.com/trailer.mp4",
          },
        ],
        [],
      )
    ).fields.media.videos,
  ).toEqual([]);
});
test("posters come from the official video CDN and reject foreign URLs", () => {
  const url = `https://assets.nintendo.com/video/upload/store/software/switch/${nsuid}/Video/trailer.mp4`;
  expect(nintendoVideoPoster(url)).toBe(url.replace(".mp4", ".jpg"));
  expect(
    nintendoVideoPoster(url.replace("assets.nintendo.com", "evil.test")),
  ).toBeUndefined();
  expect(nintendoVideoPoster(url + "?redirect=foo")).toBeUndefined();
});

test("Bananza import reads the Nintendo HTML and returns the exact cover, six screenshots, two trailers and poster", async () => {
  const request = jest
    .spyOn(global, "fetch")
    .mockImplementation(
      async (input) =>
        new Response(
          bananzaHtml(String(input).includes("/pt-br/") ? "BR" : "US"),
          { status: 200 },
        ),
    );
  try {
    const strategy = createNintendoStrategy({ fetchProduct });
    const result = await strategy.fetchSnapshot(
      strategy.parseReference(
        "https://www.nintendo.com/pt-br/store/products/donkey-kong-bananza-switch-2/",
      ),
      { regionalOutcomes: {}, failureOutcome: "SERVICE_ERROR" },
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.externalId).toBe("70010000096809");
    expect(result.fields.media).toEqual(bananzaExpectedMedia);
    expect(result.fields.media.screenshots).toHaveLength(6);
    expect(result.fields.media.videos).toHaveLength(2);
    expect(nintendoVideoPoster(bananzaExpectedMedia.videos[0])).toBe(
      "https://assets.nintendo.com/video/upload/store/software/switch2/70010000096809/Video/216b4fb1cd8aa19fb1383db58f2ad7a09ca16d091c58e844c26371b0c5e9103e.jpg",
    );
  } finally {
    request.mockRestore();
  }
});

test("missing upstream videos preserve an existing editorial trailer without preserving stale screenshots", () => {
  expect(
    preserveMissingVideos(
      { videos: [], screenshots: ["new.jpg"] },
      {
        videos: ["https://www.youtube.com/watch?v=AjJWzJC8Kfk"],
        screenshots: ["old.jpg"],
      },
    ),
  ).toEqual({
    videos: ["https://www.youtube.com/watch?v=AjJWzJC8Kfk"],
    screenshots: ["new.jpg"],
  });
  expect(
    preserveMissingVideos({ videos: ["new.mp4"] }, { videos: ["old.mp4"] }),
  ).toEqual({ videos: ["new.mp4"] });
  expect(preserveMissingVideos({ videos: [] }, { videos: [{}] })).toEqual({
    videos: [],
  });
});
