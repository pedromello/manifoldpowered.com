import steam from "infra/steam";

describe("Steam app details gateway", () => {
  afterEach(() => jest.restoreAllMocks());

  test("requests the selected country and language", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ "391220": { success: true, data: {} } }), {
        status: 200,
      }),
    );

    await steam.fetchAppDetails("391220", "br", "brazilian");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://store.steampowered.com/api/appdetails?appids=391220&cc=br&l=brazilian",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
