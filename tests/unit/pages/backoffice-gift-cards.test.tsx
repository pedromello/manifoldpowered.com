import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import GiftCardOperationsPage from "pages/backoffice/gift-cards";
import useSWR from "swr";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
}));
jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    t: (message: string) => message,
    translateError: (message: string | undefined, fallback: string) =>
      message || fallback,
    locale: "en",
  }),
}));

type Element = ReactElement<Record<string, unknown>>;
const originalFetch = global.fetch;
const mutate = jest.fn();
let state: unknown[], cursor: number;
let summary: {
  products: Array<{
    id: string;
    code: string;
    name: string;
    amount_minor: number;
    currency: string;
    enabled: boolean;
    available: boolean;
  }>;
  last_sync_at: string | null;
  last_error: string | null;
};

beforeEach(() => {
  jest.clearAllMocks();
  state = [];
  summary = { products: [], last_sync_at: null, last_error: null };
  jest.mocked(useState).mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [
      state[index],
      (value: unknown) => {
        state[index] = value;
      },
    ];
  }) as typeof useState);
  (useSWR as unknown as jest.Mock).mockImplementation(() => ({
    data: summary,
    mutate,
    isLoading: false,
  }));
  mutate.mockResolvedValue(undefined);
  global.fetch = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
});

function elements(node: ReactNode): Element[] {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [
    element,
    ...Children.toArray(element.props.children as ReactNode).flatMap(elements),
  ];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  return Children.toArray((node as Element).props.children as ReactNode)
    .map(text)
    .join("");
}
function render() {
  cursor = 0;
  return GiftCardOperationsPage({ manualTracking: true });
}
function operation(node: ReactNode, label = "Sync catalog") {
  const card = elements(node).find(
    (element) =>
      element.type === "div" &&
      Children.toArray(element.props.children as ReactNode).some(
        (child) =>
          isValidElement(child) && child.type === "h3" && text(child) === label,
      ),
  );
  if (!card) throw new Error(`Missing operation ${label}`);
  return card;
}
function run(node: ReactNode) {
  const button = elements(operation(node)).find(
    (element) => element.type === "button",
  )!;
  return (button.props.onClick as () => void)();
}
async function settle() {
  // The click deliberately returns void; flush its request and summary promises.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("a successful sync keeps its pending and completion feedback beside the clicked button and refreshes products", async () => {
  let finish!: (value: Response) => void;
  jest.mocked(global.fetch).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mutate.mockImplementation(async () => {
    summary = {
      ...summary,
      products: [
        {
          id: "synthetic-product",
          code: "synthetic-product",
          name: "Synthetic gift card",
          amount_minor: 2500,
          currency: "BRL",
          enabled: false,
          available: true,
        },
      ],
    };
  });
  run(render());
  const pending = operation(render());
  expect(pending.props["aria-busy"]).toBe(true);
  expect(
    elements(pending).some(
      (element) =>
        element.props.role === "status" &&
        text(element).includes("Please wait"),
    ),
  ).toBe(true);
  finish({
    ok: true,
    json: async () => ({
      processed: 1,
      succeeded: 1,
      failed: 0,
      remaining: 0,
      last_error: null,
    }),
  } as Response);
  await settle();
  const node = render();
  const completed = operation(node);
  expect(completed.props["aria-busy"]).toBe(false);
  expect(
    elements(completed).some(
      (element) =>
        element.props.role === "status" &&
        text(element).includes("Succeeded: 1"),
    ),
  ).toBe(true);
  expect(text(node)).toContain("Synthetic gift card");
  expect(mutate).toHaveBeenCalledTimes(1);
});

test("the real configuration failure remains visible at sync even if refreshing the summary also fails", async () => {
  const message = "Gift card sandbox configuration requires verification.";
  jest.mocked(global.fetch).mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ message }),
  } as Response);
  mutate.mockRejectedValue(new Error("Summary unavailable"));
  run(render());
  await settle();
  const card = operation(render());
  expect(card.props["aria-busy"]).toBe(false);
  expect(
    elements(card).some(
      (element) => element.props.role === "alert" && text(element) === message,
    ),
  ).toBe(true);
  expect(text(card)).not.toContain("Summary unavailable");
  expect(mutate).toHaveBeenCalledTimes(1);
});

test("a failed sync refreshes persisted error state without claiming success", async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({
      message:
        "Gift card catalog could not be validated. The previous catalog was preserved.",
    }),
  } as Response);
  mutate.mockImplementation(async () => {
    summary = { ...summary, last_error: "CATALOG_SYNC_FAILED" };
  });
  run(render());
  await settle();
  const node = render();
  const card = operation(node);
  expect(elements(card).some((element) => element.props.role === "alert")).toBe(
    true,
  );
  expect(text(node)).toContain("CATALOG_SYNC_FAILED");
  expect(text(card)).not.toContain("Succeeded:");
});

test.each([
  null,
  { processed: 1 },
  { processed: "1", succeeded: 1, failed: 0, remaining: 0, last_error: null },
])(
  "an invalid successful response is a visible error instead of a render failure (%j)",
  async (result) => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue({ ok: true, json: async () => result } as Response);
    run(render());
    await settle();
    const card = operation(render());
    expect(
      elements(card).some(
        (element) =>
          element.props.role === "alert" &&
          text(element) === "The operation could not be completed.",
      ),
    ).toBe(true);
    expect(text(card)).not.toContain("Succeeded:");
    expect(mutate).toHaveBeenCalledTimes(1);
  },
);
