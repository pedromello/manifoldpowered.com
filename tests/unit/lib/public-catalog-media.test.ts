import { projectCatalogMedia } from "lib/public-catalog-media";

describe("MCP catalog media policy", () => {
  test("uses only stored approved assets, bounds galleries and normalizes video-only links", () => {
    const image = "https://shared.fastly.steamstatic.com/game/image.jpg";
    const file = "https://video.fastly.steamstatic.com/game/trailer.mp4";
    expect(
      projectCatalogMedia({
        banner: image,
        screenshots: [image],
        videos: [file, "https://youtu.be/abcdefghijk?tracking=removed"],
      }),
    ).toEqual({
      images: [image],
      cover: image,
      screenshots: [image],
      videos: [
        { url: file, kind: "file" },
        {
          url: "https://www.youtube.com/watch?v=abcdefghijk",
          kind: "external",
        },
      ],
    });
    expect(
      projectCatalogMedia({
        screenshots: Array.from({ length: 9 }, (_, i) => `${image}?i=${i}`),
      }).images,
    ).toHaveLength(6);
  });
  test.each([
    null,
    [],
    {},
    {
      banner: "javascript:alert(1)",
      screenshots: [
        "data:text/html,code",
        "http://shared.fastly.steamstatic.com/a.jpg",
        "https://shared.fastly.steamstatic.com.evil.invalid/a.jpg",
        "https://user:secret@shared.fastly.steamstatic.com/a.jpg",
      ],
      videos: [
        "https://www.youtube.com/redirect?q=checkout",
        "https://video.fastly.steamstatic.com/checkout",
        "https://merchant.example.invalid/video.mp4",
      ],
    },
  ])(
    "omits missing/unsafe/merchant media without inventing fallback: %j",
    (input) => {
      expect(projectCatalogMedia(input)).toEqual({
        images: [],
        videos: [],
        cover: null,
        screenshots: [],
      });
    },
  );
});
