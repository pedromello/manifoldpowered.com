import {
  selectionCreateSchema,
  selectionUpdateSchema,
  selectionImageUrlSchema,
  selectionPublicationSchema,
  selectionPath,
} from "contracts/outlet-selections";

describe("named outlet selection contracts", () => {
  test("allows an empty private draft while requiring an explicit stable address", () => {
    expect(
      selectionCreateSchema.parse({
        slug: "weekend-coop",
        title: " Weekend co-op ",
      }),
    ).toEqual({
      slug: "weekend-coop",
      title: "Weekend co-op",
      description: "",
      cover_url: null,
      featured_video_url: null,
      image_urls: [],
      game_slugs: [],
    });
    expect(
      selectionCreateSchema.safeParse({ title: "Missing address" }).success,
    ).toBe(false);
  });
  test.each([
    "https://localhost/image.png",
    "https://127.0.0.1/image.png",
    "https://[::1]/image.png",
    "https://service.internal/image.png",
    "http://cdn.example.com/image.png",
    "https://user:secret@cdn.example.com/image.png",
    "https://cdn.example.com:8443/image.png",
    "javascript:alert(1)",
  ])("rejects unsafe image input: %s", (value) => {
    expect(selectionImageUrlSchema.safeParse(value).success).toBe(false);
  });
  test("accepts an HTTPS CDN URL, including normal transformation parameters", () => {
    expect(
      selectionImageUrlSchema.parse(
        "https://images.example.com/cover.jpg?w=1200",
      ),
    ).toBe("https://images.example.com/cover.jpg?w=1200");
  });
  test.each([
    "https://localhost./image.png",
    "https://localhost../image.png",
    "https://foo.localhost./image.png",
    "https://service.internal./image.png",
    "https://service.local./image.png",
    "https://service.test./image.png",
    "https://service.invalid./image.png",
    "https://cdn.example.com./image.png",
  ])(
    "rejects terminal DNS dots in both cover and gallery writes: %s",
    (url) => {
      const create = { slug: "weekend", title: "Weekend" };
      expect(selectionImageUrlSchema.safeParse(url).success).toBe(false);
      for (const fields of [{ cover_url: url }, { image_urls: [url] }]) {
        expect(
          selectionCreateSchema.safeParse({ ...create, ...fields }).success,
        ).toBe(false);
        expect(
          selectionUpdateSchema.safeParse({
            expected_draft_revision: 1,
            ...fields,
          }).success,
        ).toBe(false);
      }
    },
  );
  test("rejects duplicate games, oversized galleries, and injected ownership fields", () => {
    const input = { slug: "weekend", title: "Weekend" };
    expect(
      selectionCreateSchema.safeParse({
        ...input,
        game_slugs: ["peak", "peak"],
      }).success,
    ).toBe(false);
    expect(
      selectionCreateSchema.safeParse({
        ...input,
        image_urls: Array(7).fill("https://cdn.example.com/image.png"),
      }).success,
    ).toBe(false);
    expect(
      selectionCreateSchema.safeParse({ ...input, store_id: "another-outlet" })
        .success,
    ).toBe(false);
    expect(
      selectionCreateSchema.safeParse({
        ...input,
        game_slugs: Array.from({ length: 101 }, (_, i) => `game-${i}`),
      }).success,
    ).toBe(false);
  });
  test("requires a revision and an actual change, and makes the address immutable", () => {
    expect(selectionUpdateSchema.safeParse({ title: "Changed" }).success).toBe(
      false,
    );
    expect(
      selectionUpdateSchema.safeParse({ expected_draft_revision: 1 }).success,
    ).toBe(false);
    expect(
      selectionUpdateSchema.safeParse({
        slug: "changed",
        title: "Changed",
        expected_draft_revision: 1,
      }).success,
    ).toBe(false);
    expect(
      selectionUpdateSchema.parse({
        title: "Changed",
        expected_draft_revision: 1,
      }),
    ).toEqual({ title: "Changed", expected_draft_revision: 1 });
  });
  test("publication cannot silently infer a revision or arbitrary lifecycle action", () => {
    expect(
      selectionPublicationSchema.safeParse({ action: "publish" }).success,
    ).toBe(false);
    expect(
      selectionPublicationSchema.safeParse({
        action: "delete",
        expected_draft_revision: 1,
      }).success,
    ).toBe(false);
    expect(selectionPath("an-outlet", "a-selection")).toBe(
      "/store/an-outlet/selections/a-selection",
    );
  });
});
