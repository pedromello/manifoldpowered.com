import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { GiftCardReveal } from "components/GiftCardReveal";
import { useGiftCardEntry } from "lib/useGiftCardEntry";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
  useRef: jest.fn(),
  useEffect: jest.fn(),
  useId: () => "dialog-title",
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));
type Element = ReactElement<Record<string, unknown>>;
let values: unknown[];
let cursor: number;
let effects: Array<() => void>;
const originalFetch = global.fetch;
beforeEach(() => {
  values = [];
  cursor = 0;
  effects = [];
  jest.mocked(useState).mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = initial;
    return [
      values[index],
      (next: unknown) => {
        values[index] = next;
      },
    ];
  }) as typeof useState);
  jest.mocked(useRef).mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = { current: initial };
    return values[index];
  }) as typeof useRef);
  jest.mocked(useEffect).mockImplementation(((effect: () => void) => {
    effects.push(effect);
  }) as typeof useEffect);
  global.fetch = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
});
function tree(node: ReactNode): Element[] {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [
    element,
    ...Children.toArray(element.props.children as ReactNode).flatMap(tree),
  ];
}
const props = {
  orderId: "synthetic-order",
  onRevealed: jest.fn(async () => {}),
};
function render() {
  cursor = 0;
  effects = [];
  return GiftCardReveal(props);
}
function button(node: ReactNode, label: string) {
  const found = tree(node).find(
    (e) => e.type === "button" && e.props.children === label,
  );
  if (!found) throw new Error(`Missing ${label}`);
  return found.props.onClick as () => Promise<void> | void;
}

test("opening, cancelling and Escape never request a code", async () => {
  let node = render();
  await button(node, "Reveal code")();
  node = render();
  await button(node, "Cancel")();
  render();
  expect(values[0]).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
  await button(node, "Reveal code")();
  node = render();
  const dialog = tree(node).find((e) => e.type === "dialog")!;
  (dialog.props.onCancel as () => void)();
  render();
  expect(values[0]).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("only confirmation requests disclosure and keeps the code out of revalidation", async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      gift_card_code: "synthetic-secret-visible",
      first_revealed_at: "2026-10-01T00:00:00.000Z",
    }),
  } as Response);
  let node = render();
  expect(JSON.stringify(node)).not.toContain("synthetic-secret-visible");
  await button(node, "Reveal code")();
  node = render();
  expect(global.fetch).not.toHaveBeenCalled();
  await button(node, "Confirm and reveal")();
  node = render();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/v1/gift-card-orders/synthetic-order/reveal",
    expect.objectContaining({
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ confirm: true }),
    }),
  );
  expect(JSON.stringify(node)).toContain("synthetic-secret-visible");
  expect(props.onRevealed).toHaveBeenCalledWith();
});

test("failed disclosure keeps the modal actionable and displays no code", async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
  let node = render();
  await button(node, "Reveal code")();
  node = render();
  await button(node, "Confirm and reveal")();
  node = render();
  expect(values[0]).toBe(true);
  expect(values[2]).toBeNull();
  expect(JSON.stringify(node)).toContain(
    "The gift card could not be revealed.",
  );
});

function Entry(
  id: string | null,
  loaded: string | undefined,
  pending: boolean,
  reconcile: (id: string) => Promise<unknown>,
) {
  cursor = 0;
  effects = [];
  useGiftCardEntry(id, loaded, pending, reconcile);
  effects.forEach((effect) => effect());
}

test("detail entry attempts once despite Strict Mode, rerenders and status refresh", () => {
  const reconcile = jest.fn(async () => {});
  Entry("one", undefined, true, reconcile);
  expect(reconcile).not.toHaveBeenCalled();
  Entry("one", "one", true, reconcile);
  Entry("one", "one", true, reconcile);
  Entry("one", "one", false, reconcile);
  expect(reconcile).toHaveBeenCalledTimes(1);
  Entry(null, undefined, false, reconcile);
  Entry("one", "one", true, reconcile);
  expect(reconcile).toHaveBeenCalledTimes(2);
});

test("settled orders and listing entry do not reconcile", () => {
  const reconcile = jest.fn(async () => {});
  Entry(null, undefined, false, reconcile);
  Entry("one", "one", false, reconcile);
  Entry("one", "one", true, reconcile);
  expect(reconcile).not.toHaveBeenCalled();
});
