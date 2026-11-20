import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GiftCardRecipient } from "components/checkout/Checkout";

jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [
    element,
    ...Children.toArray(element.props.children as ReactNode).flatMap(elements),
  ];
}
const delivery = {
  channel: "EMAIL" as const,
  email: "verified@example.test",
  confirmed: false,
  recipient_ready: false,
  verification_required: false,
};

test("recipient confirmation sends identity fields and explicit confirmation without client supplied email", async () => {
  const onConfirm = jest.fn(async () => {});
  const node = GiftCardRecipient({
    delivery,
    busy: false,
    orderId: "order",
    onConfirm,
  });
  const form = elements(node).find((element) => element.type === "form")!;
  const original = global.FormData;
  global.FormData = jest.fn(() => ({
    get: (name: string) =>
      ({
        recipient_name: "  Synthetic Buyer  ",
        recipient_document: "123.456.789-09",
        confirm_delivery: "on",
        email: "attacker@example.test",
      })[name],
  })) as unknown as typeof FormData;
  try {
    await (form.props.onSubmit as (event: unknown) => Promise<void>)({
      preventDefault: jest.fn(),
      currentTarget: { reportValidity: () => true },
    });
    expect(onConfirm).toHaveBeenCalledWith({
      name: "Synthetic Buyer",
      document: "12345678909",
      confirmed: true,
    });
  } finally {
    global.FormData = original;
  }
});

test("unchecked delivery consent never submits recipient details", async () => {
  const onConfirm = jest.fn(async () => {});
  const node = GiftCardRecipient({
    delivery,
    busy: false,
    orderId: "order",
    onConfirm,
  });
  const form = elements(node).find((element) => element.type === "form")!;
  const original = global.FormData;
  global.FormData = jest.fn(() => ({
    get: () => null,
  })) as unknown as typeof FormData;
  try {
    await (form.props.onSubmit as (event: unknown) => Promise<void>)({
      preventDefault: jest.fn(),
      currentTarget: { reportValidity: () => true },
    });
    expect(onConfirm).not.toHaveBeenCalled();
  } finally {
    global.FormData = original;
  }
});

test("configured document requirement reaches the form without disclosing saved identity", () => {
  const node = GiftCardRecipient({
    delivery: { ...delivery, document_required: true },
    busy: false,
    orderId: "order",
    onConfirm: async () => {},
  });
  const document = elements(node).find(
    (element) => element.props.name === "recipient_document",
  )!;
  expect(document.props.required).toBe(true);
  expect(document.props.value).toBeUndefined();
  expect(renderToStaticMarkup(node)).toContain("verified@example.test");
});
