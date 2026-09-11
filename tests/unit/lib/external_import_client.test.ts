import {
  externalImportErrorMessage,
  requestExternalImport,
} from "lib/external_import_client";

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([
  ["steam", "400", "steam_app_id"],
  ["nintendo", "https://www.nintendo.com/us/store/products/game/", "eshop_url"],
] as const)(
  "%s uses the same pending/cached lifecycle with its own request contract",
  async (provider, value, field) => {
    jest.useFakeTimers();
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            refresh: { state: "in_progress", operation_id: "opaque&id" },
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            slug: "game",
            refresh: { state: "cached" },
          }),
        ),
      );
    const progress = jest.fn();
    const pending = requestExternalImport(
      provider,
      value,
      "pt-BR",
      progress,
      new AbortController().signal,
    );
    await jest.advanceTimersByTimeAsync(2600);
    expect((await pending).slug).toBe("game");
    const [postUrl, post] = fetchMock.mock.calls[0];
    expect(postUrl).toBe(`/api/v1/items/games/${provider}-import?locale=pt-BR`);
    expect(post?.method).toBe("POST");
    expect(JSON.parse(post?.body as string)).toEqual({ [field]: value });
    const [getUrl, get] = fetchMock.mock.calls[1];
    const url = new URL(String(getUrl), "https://manifold.test");
    expect(url.searchParams.get("operation_id")).toBe("opaque&id");
    expect(url.searchParams.get(field)).toBe(value);
    expect(url.searchParams.get("locale")).toBe("pt-BR");
    expect(get?.method).toBeUndefined();
    expect(progress.mock.calls.map(([info]) => info.state)).toEqual([
      "in_progress",
      "cached",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

test("leaving the shared flow aborts polling without restarting an import", async () => {
  jest.useFakeTimers();
  const controller = new AbortController();
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        refresh: { state: "in_progress", operation_id: "operation" },
      }),
      { status: 202 },
    ),
  );
  const pending = requestExternalImport(
    "steam",
    "400",
    "en",
    jest.fn(),
    controller.signal,
  );
  const assertion = expect(pending).rejects.toThrow("pending");
  await jest.advanceTimersByTimeAsync(1);
  controller.abort();
  await assertion;
  await jest.advanceTimersByTimeAsync(31000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("shared errors preserve provider fallbacks and the pending timeout message", () => {
  expect(externalImportErrorMessage(null, "steam")).toBe(
    "Steam import failed.",
  );
  expect(externalImportErrorMessage(null, "nintendo")).toBe(
    "Nintendo import failed.",
  );
  expect(
    externalImportErrorMessage(
      new DOMException("timeout", "TimeoutError"),
      "steam",
    ),
  ).toBe("The update is still pending. Try again shortly.");
  expect(
    externalImportErrorMessage(new Error("Rate limit reached"), "nintendo"),
  ).toBe("Rate limit reached");
});
