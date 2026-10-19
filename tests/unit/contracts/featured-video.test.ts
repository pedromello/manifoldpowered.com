import {
  youtubeVideoId,
  featuredVideoUrlSchema,
  youtubeVideo,
  featuredVideoUrl,
  featuredVideoFields,
} from "contracts/featured-video";
import {
  selectionCreateSchema,
  selectionUpdateSchema,
  selectionSnapshotSchema,
} from "contracts/outlet-selections";
import { storeUpdateSchema } from "contracts/creator-requests";
import {
  resolveDraftPresentation,
  storePresentationSchema,
} from "models/store_presentation";

const id = "g7QcidQx73s";
test.each([
  ["t=68", 68],
  ["t=623", 623],
  ["t=1m8s", 68],
  ["t=1h2m3s", 3723],
  ["start=623", 623],
  ["t=0", 0],
])("preserves supported start time %s", (query, seconds) => {
  const value = `https://youtu.be/${id}?si=tracking&${query}`;
  const video = youtubeVideo(value)!;
  expect(video.start_seconds ?? 0).toBe(seconds);
  expect(featuredVideoFields(value)).toEqual({
    featured_video_id: id,
    featured_video_start_seconds: seconds,
  });
  expect(featuredVideoUrl(video)).toBe(
    `https://www.youtube.com/watch?v=${id}${seconds ? `&t=${seconds}` : ""}`,
  );
});
test.each([
  "t=-1",
  "t=1.5",
  "t=1e3",
  "t=abc",
  "t=",
  "t=604801",
  "t=999999h",
  "t=68&t=623",
  "t=68&start=623",
])("rejects invalid or ambiguous start time %s", (query) => {
  expect(
    featuredVideoUrlSchema.safeParse(`https://youtu.be/${id}?${query}`).success,
  ).toBe(false);
});
test("removal clears both video ID and start time", () => {
  expect(featuredVideoFields(null)).toEqual({
    featured_video_id: null,
    featured_video_start_seconds: 0,
  });
});
test("normalizes v2 snapshots without rewriting historical video settings", () => {
  const previous = {
    ...resolveDraftPresentation(),
    version: 2,
    featured_video: { provider: "YOUTUBE", video_id: id },
  };
  expect(storePresentationSchema.parse(previous)).toMatchObject({
    version: 3,
    featured_video: { video_id: id },
  });
  expect(previous.version).toBe(2);
  expect(previous.featured_video).not.toHaveProperty("start_seconds");
});
test.each([
  `https://www.youtube.com/watch?v=${id}`,
  `https://youtube.com/watch?v=${id}&t=30`,
  `https://youtu.be/${id}?si=tracking`,
  `https://m.youtube.com/watch?v=${id}`,
])("accepts a known YouTube video form: %s", (url) => {
  expect(youtubeVideoId(url)).toBe(id);
  expect(featuredVideoUrlSchema.safeParse(url).success).toBe(true);
});
test.each([
  `http://youtube.com/watch?v=${id}`,
  `https://youtube.com.evil.test/watch?v=${id}`,
  `https://youtube.com@evil.test/watch?v=${id}`,
  `https://user:secret@youtube.com/watch?v=${id}`,
  `https://youtube.com:8443/watch?v=${id}`,
  `https://youtu.be/${id}/other`,
  `https://youtube.com/watch?v=${id}&v=${id}`,
  "javascript:alert(1)",
  '<iframe src="https://youtube.com"></iframe>',
  "https://youtube.com/@channel",
  "https://youtu.be/invalid",
])("rejects unsupported or hostile input: %s", (url) => {
  expect(featuredVideoUrlSchema.safeParse(url).success).toBe(false);
});
test("keeps omitted updates different from explicit removal", () => {
  expect(storeUpdateSchema.parse({ name: "Renamed" })).not.toHaveProperty(
    "featured_video_url",
  );
  expect(storeUpdateSchema.parse({ featured_video_url: null })).toHaveProperty(
    "featured_video_url",
    null,
  );
  expect(
    selectionUpdateSchema.parse({
      title: "Renamed",
      expected_draft_revision: 2,
    }),
  ).not.toHaveProperty("featured_video_url");
  expect(
    selectionUpdateSchema.parse({
      featured_video_url: null,
      expected_draft_revision: 2,
    }),
  ).toHaveProperty("featured_video_url", null);
  expect(
    selectionCreateSchema.parse({ slug: "weekend", title: "Weekend" })
      .featured_video_url,
  ).toBeNull();
});
test("reads old immutable presentation and selection snapshots without rewriting them", () => {
  const { featured_video: _video, ...legacy } = resolveDraftPresentation();
  expect(_video).toBeNull();
  const old = { ...legacy, version: 1 };
  expect(storePresentationSchema.parse(old)).toMatchObject({
    version: 3,
    featured_video: null,
  });
  expect(old).not.toHaveProperty("featured_video");
  expect(
    selectionSnapshotSchema.parse({
      title: "Old",
      description: "",
      cover_url: null,
      image_urls: [],
      game_ids: [],
    }).featured_video,
  ).toBeNull();
});
