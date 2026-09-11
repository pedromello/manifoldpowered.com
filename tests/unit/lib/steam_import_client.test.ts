import { requestExternalImport } from "lib/external_import_client";

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
  const pending = requestExternalImport(
    "steam",
    "400",
    "en",
    progress,
    new AbortController().signal,
  );
  await jest.advanceTimersByTimeAsync(2600);
  expect((await pending).slug).toBe("game");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  expect(fetchMock.mock.calls[0][0]).toContain("/steam-import");
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
    steam_app_id: "400",
  });
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
  const pending = requestExternalImport(
    "steam",
    "400",
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
