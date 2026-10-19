import {
  youtubeVideoId,
  featuredVideoUrlSchema,
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
  const old = { ...legacy, version: 1 };
  expect(storePresentationSchema.parse(old)).toMatchObject({
    version: 2,
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
