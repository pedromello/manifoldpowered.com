import {
  reviewTextParts,
  youtubeEmbedsFromText,
  youtubeVideoId,
} from "lib/youtube";

describe("YouTube review links", () => {
  test.each([
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
  ])("extracts the video id from %s", (url) => {
    expect(youtubeVideoId(url)).toBe("dQw4w9WgXcQ");
  });

  test("rejects lookalike hosts and malformed video ids", () => {
    expect(
      youtubeVideoId("https://youtube.com.example.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(youtubeVideoId("https://youtube.com/watch?v=short")).toBeNull();
  });

  test("deduplicates embeds while preserving links in creator copy", () => {
    const text =
      "First https://youtu.be/dQw4w9WgXcQ, again https://youtube.com/watch?v=dQw4w9WgXcQ and docs https://example.com.";

    expect(youtubeEmbedsFromText(text)).toEqual([
      { id: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ" },
    ]);
    expect(reviewTextParts(text)).toEqual(
      expect.arrayContaining([
        { kind: "link", value: "https://youtu.be/dQw4w9WgXcQ" },
        { kind: "link", value: "https://example.com" },
      ]),
    );
  });
});
