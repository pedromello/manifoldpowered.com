/** @jest-environment jsdom */
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProductPageEvent } from "components/analytics/ProductPageEvent";

const router = { asPath: "/store", query: {} as Record<string, string> };
const client = {
  ready: jest.fn(),
  capturePage: jest.fn(),
  subscribe: jest.fn(() => () => {}),
};
jest.mock("next/router", () => ({ useRouter: () => router }));
jest.mock("lib/product-events-client", () => ({
  productEventsClient: () => client,
}));
const event = {
  name: "public_page_viewed" as const,
  target: {},
  properties: {
    locale: "en" as const,
    entry_surface: "catalog" as const,
    page_kind: "catalog" as const,
  },
};
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  router.asPath = "/store";
  router.query = {};
  client.ready.mockReset().mockResolvedValue(true);
  client.capturePage.mockReset();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => "00000000-0000-4000-8000-000000000001",
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

test("StrictMode does not observe the discarded effect", async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <ProductPageEvent event={event} />
      </StrictMode>,
    ),
  );
  expect(client.capturePage).toHaveBeenCalledTimes(1);
});
test.each([
  { preview: true },
  { query: { preview: "1" } },
  { query: { social_preview: "1" } },
])("excludes private/social previews %o", async (testCase) => {
  router.query = testCase.query ?? {};
  await act(async () =>
    root.render(<ProductPageEvent event={event} preview={testCase.preview} />),
  );
  expect(client.ready).not.toHaveBeenCalled();
  expect(client.capturePage).not.toHaveBeenCalled();
});
test("waits for visibility and ignores an unmounted page awaiting bootstrap", async () => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  await act(async () => root.render(<ProductPageEvent event={event} />));
  expect(client.capturePage).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(client.capturePage).toHaveBeenCalledTimes(1);
  let finish;
  client.ready.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  router.asPath = "/store?tag=co-op";
  await act(async () => root.render(<ProductPageEvent event={event} />));
  await act(async () => root.render(null));
  await act(async () => finish(true));
  expect(client.capturePage).toHaveBeenCalledTimes(1);
});
