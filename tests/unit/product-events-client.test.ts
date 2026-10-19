import { createProductEventsClient } from "lib/product-events-client";

const input = {
  name: "public_page_viewed" as const,
  target: {},
  properties: {
    locale: "en" as const,
    entry_surface: "catalog" as const,
    page_kind: "catalog" as const,
  },
};
function setup() {
  let id = 0;
  const fetcher = jest
    .fn()
    .mockImplementation(async (_url, init) =>
      JSON.parse(init.body).type === "bootstrap"
        ? Response.json({ generation: "generation-a" })
        : Response.json({ accepted: 1, duplicated: 0 }),
    );
  const client = createProductEventsClient({
    fetch: fetcher,
    now: () => Date.now(),
    uuid: () => "00000000-0000-4000-8000-" + String(++id).padStart(12, "0"),
    schedule: setTimeout,
    cancel: clearTimeout,
  });
  return { client, fetcher };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("does not collect before bootstrap; repeated page effect has one occurrence", async () => {
  const { client, fetcher } = setup();
  expect(client.capture(input)).toBe(false);
  await client.ready();
  client.capturePage(input, "page-occurrence");
  client.capturePage(input, "page-occurrence");
  await client.flush();
  const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(init.body));
  expect(bodies[0]).toEqual({ type: "bootstrap" });
  expect(bodies[1].events).toHaveLength(1);
  expect(bodies[1].events[0].id).toBeTruthy();
});

test("caps buffer and body batches with one request in flight", async () => {
  const { client, fetcher } = setup();
  await client.ready();
  let finish;
  fetcher.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  for (let i = 0; i < 100; i++) client.capture(input);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).events).toHaveLength(10);
  finish(Response.json({ accepted: 10 }));
  await Promise.resolve();
  await Promise.resolve();
  fetcher.mockResolvedValue(Response.json({ accepted: 10 }));
  for (let i = 0; i < 5; i++) await client.flush();
  const events = fetcher.mock.calls
    .slice(1)
    .flatMap(([, init]) => JSON.parse(init.body).events);
  expect(events).toHaveLength(50);
});

test("retries once with the same UUID after a network failure", async () => {
  const { client, fetcher } = setup();
  await client.ready();
  client.capture(input);
  fetcher.mockRejectedValueOnce(new Error("synthetic network failure"));
  await client.flush();
  await jest.advanceTimersByTimeAsync(2000);
  const batches = fetcher.mock.calls.filter(
    ([, init]) => JSON.parse(init.body).type === "events",
  );
  expect(batches).toHaveLength(2);
  expect(JSON.parse(batches[0][1].body)).toEqual(
    JSON.parse(batches[1][1].body),
  );
});

test("drops stale events on 409 and never resends them after new bootstrap", async () => {
  const { client, fetcher } = setup();
  await client.ready();
  client.capture(input);
  fetcher.mockResolvedValueOnce(new Response(null, { status: 409 }));
  await client.flush();
  await Promise.resolve();
  await Promise.resolve();
  await client.ready();
  await client.flush();
  expect(
    fetcher.mock.calls.filter(
      ([, init]) => JSON.parse(init.body).type === "events",
    ),
  ).toHaveLength(1);
});

test("auth changes discard queued events and prevent an old in-flight retry", async () => {
  const { client, fetcher } = setup();
  await client.ready();
  client.capture(input);
  let finish;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const flight = client.flush();
  client.recognize("generation-b");
  finish(new Response(null, { status: 503 }));
  await flight;
  fetcher.mockResolvedValue(Response.json({ accepted: 1 }));
  client.capture(input);
  await client.flush();
  const bodies = fetcher.mock.calls
    .filter(([, init]) => JSON.parse(init.body).type === "events")
    .map(([, init]) => JSON.parse(init.body));
  expect(bodies.map((body) => body.context_generation)).toEqual([
    "generation-a",
    "generation-b",
  ]);
  expect(bodies[1].events[0].id).not.toBe(bodies[0].events[0].id);
});

test("respects Retry-After but does not retry permanent errors", async () => {
  const { client, fetcher } = setup();
  await client.ready();
  client.capture(input);
  fetcher.mockResolvedValueOnce(
    new Response(null, { status: 429, headers: { "Retry-After": "5" } }),
  );
  await client.flush();
  await jest.advanceTimersByTimeAsync(4000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(3);
  client.capture(input);
  fetcher.mockResolvedValueOnce(new Response(null, { status: 400 }));
  await client.flush();
  await jest.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test("idle return revalidates context and gives the same visible page a new occurrence", async () => {
  const { client, fetcher } = setup();
  await client.ready();
  client.capturePage(input, "same-navigation");
  await client.flush();
  const notify = jest.fn(() => client.capturePage(input, "same-navigation"));
  client.subscribe(notify);
  await jest.advanceTimersByTimeAsync(31 * 60_000);
  fetcher.mockResolvedValueOnce(Response.json({ generation: "generation-b" }));
  await client.ready();
  client.capturePage(input, "same-navigation");
  await client.flush();
  const batches = fetcher.mock.calls
    .map(([, init]) => JSON.parse(init.body))
    .filter((body) => body.type === "events");
  expect(notify).toHaveBeenCalledTimes(1);
  expect(batches).toHaveLength(2);
  expect(batches[1].context_generation).toBe("generation-b");
  expect(batches[1].events[0].id).not.toBe(batches[0].events[0].id);
});
