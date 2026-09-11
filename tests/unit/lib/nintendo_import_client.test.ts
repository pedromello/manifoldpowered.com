import { requestNintendoImport } from "lib/nintendo_import_client";

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test("followers poll GET and never restart a POST", async () => {
  jest.useFakeTimers();
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          refresh: { state: "in_progress", operation_id: "operation" },
        }),
        { status: 202 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ slug: "game", refresh: { state: "updated" } }),
      ),
    );
  const progress = jest.fn();
  const pending = requestNintendoImport(
    "https://www.nintendo.com/us/store/products/game/",
    "en",
    progress,
    new AbortController().signal,
  );
  await jest.advanceTimersByTimeAsync(2600);
  expect((await pending).slug).toBe("game");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  expect(fetchMock.mock.calls[1][0]).toContain("operation_id=operation");
  expect(fetchMock.mock.calls[1][1]?.method).toBeUndefined();
});
test("polling stops at its deadline without a second import", async () => {
  jest.useFakeTimers();
  const fetchMock = jest.spyOn(global, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          refresh: { state: "in_progress", operation_id: "operation" },
        }),
      ),
  );
  const pending = requestNintendoImport(
    "url",
    "en",
    jest.fn(),
    new AbortController().signal,
  );
  const assertion = expect(pending).rejects.toThrow("pending");
  await jest.advanceTimersByTimeAsync(31000);
  await assertion;
  expect(
    fetchMock.mock.calls.filter((call) => call[1]?.method === "POST"),
  ).toHaveLength(1);
  const count = fetchMock.mock.calls.length;
  await jest.advanceTimersByTimeAsync(30000);
  expect(fetchMock).toHaveBeenCalledTimes(count);
});
