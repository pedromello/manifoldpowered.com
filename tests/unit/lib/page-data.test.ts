import { fetchPageData } from "lib/page-data";

describe("fetchPageData", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns parsed data for a successful response", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ slug: "real" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchPageData("https://example.test/item")).resolves.toEqual({
      slug: "real",
    });
  });

  test("returns null only for a confirmed 404", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      fetchPageData("https://example.test/missing"),
    ).resolves.toBeNull();
  });

  test("preserves temporary upstream errors as errors instead of 404 data", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      fetchPageData("https://example.test/temporary"),
    ).rejects.toThrow("status 503");
  });

  test("preserves network failures", async () => {
    jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("connection reset"));

    await expect(fetchPageData("https://example.test/network")).rejects.toThrow(
      "connection reset",
    );
  });
});
