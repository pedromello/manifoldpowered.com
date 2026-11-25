/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import useSWR from "swr";
import { Checkout } from "components/checkout/Checkout";
import type { BuyerCheckout } from "contracts/purchase-orders";

jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("next/script", () => ({ __esModule: true, default: () => null }));
jest.mock("components/store/GiftCardArtwork", () => ({
  GiftCardArtwork: () => null,
}));

const checkout: BuyerCheckout = {
  order: {
    id: "synthetic-order",
    item_type: "GIFT_CARD",
    item_id: "sandbox-brl-25",
    product_name: "Demo gift card",
    product_slug: null,
    image_url: null,
    amount_minor: 2500,
    total_minor: 2500,
    interest_minor: 0,
    installments: 1,
    currency: "BRL",
    payment_status: "UNPAID",
    delivery_status: "PENDING",
    created_at: "2026-10-12T15:00:00Z",
    gift_card_order_id: "synthetic-order",
    can_pay: true,
    can_cancel: true,
  },
  gift_card_delivery: {
    channel: "EMAIL",
    confirmed: true,
    recipient_ready: true,
    verification_required: false,
    email: "recipient@example.test",
    document_required: true,
    recipient_first_name: "Synthetic Maria",
    recipient_last_name: "de Buyer",
  },
  checkout: {
    available: true,
    hosted: false,
    methods: ["pix", "card"],
    installments: false,
    external_id: "synthetic-installation",
    script_url: "https://scripts.sandboxappmax.com.br/appmax.min.js",
  },
  attempt: null,
};

test("editing the payer names requires a separate document on both Pix and card", () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  (useSWR as unknown as jest.Mock).mockImplementation((key: unknown) => ({
    data:
      key === "/api/v1/user"
        ? { id: "synthetic-buyer" }
        : key === null
          ? undefined
          : checkout,
    isLoading: false,
    mutate: jest.fn(),
  }));
  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.append(container);
  const input = (name: string) =>
    container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  function fill(name: string, value: string) {
    const field = input(name)!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const reuse = () => input("reuse_recipient_document")!;
  try {
    act(() => root.render(<Checkout orderId={checkout.order.id} />));
    expect(input("first_name")?.value).toBe("Synthetic Maria");
    expect(input("last_name")?.value).toBe("de Buyer");
    expect(reuse().checked).toBe(true);
    expect(input("document_number")).toBeNull();

    fill("first_name", "SYNTHETIC  Maria");
    expect(reuse().checked).toBe(true);
    fill("first_name", "Another");
    fill("last_name", "Payer");
    expect(reuse().checked).toBe(false);
    expect(reuse().disabled).toBe(true);
    expect(input("document_number")?.required).toBe(true);

    const cardButton = [...container.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "Credit card",
    )!;
    act(() => cardButton.click());
    expect(input("first_name")?.value).toBe("Another");
    expect(input("last_name")?.value).toBe("Payer");
    expect(reuse().checked).toBe(false);
    expect(input("document_number")?.required).toBe(true);
    expect(container.textContent).toContain("recipient@example.test");

    fill("first_name", "Synthetic Maria");
    fill("last_name", "de Buyer");
    expect(reuse().checked).toBe(true);
    expect(input("document_number")).toBeNull();

    fill("card-holder-name", "S M de Buyer");
    expect(reuse().checked).toBe(false);
    expect(reuse().disabled).toBe(false);
    expect(input("document_number")?.required).toBe(true);

    act(() => reuse().click());
    expect(reuse().checked).toBe(true);
    expect(input("document_number")).toBeNull();

    fill("card-holder-name", "Different Cardholder");
    expect(reuse().checked).toBe(false);
    expect(input("document_number")?.required).toBe(true);
  } finally {
    act(() => root.unmount());
    container.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
