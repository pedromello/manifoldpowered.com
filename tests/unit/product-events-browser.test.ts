/** @jest-environment jsdom */

const page = {
  name: "public_page_viewed" as const,
  target: {},
  properties: {
    locale: "en" as const,
    entry_surface: "catalog" as const,
    page_kind: "catalog" as const,
  },
};
const official = {
  name: "external_store_clicked" as const,
  target: { game_slug: "example-game" },
  properties: {
    locale: "en" as const,
    entry_surface: "game_page" as const,
    provider: "steam" as const,
  },
};
const previousEnabled = process.env.NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  process.env.NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED = "true";
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
  if (previousEnabled === undefined)
    delete process.env.NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED;
  else process.env.NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED = previousEnabled;
});

test("browser singleton preserves the native timer receiver and immediately sends an outgoing click", async () => {
  const nativeCancel = window.clearTimeout.bind(window);
  const cancelled = jest
    .spyOn(window, "clearTimeout")
    .mockImplementation(function (this: Window, timer) {
      // Native browser timers may enforce a Window receiver, unlike Node timers.
      if (this !== window) throw new TypeError("Illegal invocation");
      nativeCancel(timer);
    });
  const fetcher = jest.fn(
    async (_url: unknown, init: RequestInit) =>
      ({
        ok: true,
        status: 200,
        json: async () =>
          JSON.parse(String(init.body)).type === "bootstrap"
            ? { generation: "browser-context" }
            : { accepted: 2 },
      }) as Response,
  );
  window.fetch = fetcher as typeof fetch;
  const { productEventsClient, trackExternalStore } =
    await import("lib/product-events-client");
  const client = productEventsClient()!;
  await client.ready();
  expect(client.capture(page)).toBe(true);
  expect(() => trackExternalStore(official)).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
  expect(cancelled).toHaveBeenCalled();
  const batches = fetcher.mock.calls
    .map(([, init]) => JSON.parse(String(init.body)))
    .filter((body) => body.type === "events");
  expect(batches).toHaveLength(1);
  expect(
    batches[0].events.map((event: { name: string }) => event.name),
  ).toEqual(["public_page_viewed", "external_store_clicked"]);
  expect(fetcher.mock.calls[1][1].keepalive).toBe(true);
});

test("outgoing-click and pagehide flush failures stay contained", async () => {
  window.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({ generation: "browser-context" }),
      }) as Response,
  );
  const { productEventsClient, trackExternalStore } =
    await import("lib/product-events-client");
  const client = productEventsClient()!;
  await client.ready();
  const flush = jest
    .spyOn(client, "flush")
    .mockRejectedValue(new Error("synthetic flush failure"));
  expect(() => trackExternalStore(official)).not.toThrow();
  expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
  expect(flush).toHaveBeenCalledTimes(2);
});
