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

test.each([false, true])(
  "the hosted checkout confirms its original link when the buyer returns (reloaded=%s)",
  async (reloaded) => {
    const reactEnvironment = globalThis as {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
    const previousFetch = globalThis.fetch;
    const previousHidden = Object.getOwnPropertyDescriptor(document, "hidden");
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });

    const hosted: BuyerCheckout = {
      ...checkout,
      checkout: {
        available: true,
        hosted: true,
        payment_link: true,
        methods: ["link"],
        installments: false,
        external_id: null,
        script_url: null,
      },
    };
    const quote: NonNullable<BuyerCheckout["attempt"]> = {
      id: "synthetic-link-attempt",
      method: "link",
      installments: 1,
      total_minor: 2500,
      interest_minor: 0,
      quote_expires_at: new Date(Date.now() + 60000).toISOString(),
      submitted: false,
      uncertain: false,
      checkout_url: null,
      pix: null,
    };
    const url = "https://checkout.sandboxappmax.com.br/pl/synthetic";
    const pending: BuyerCheckout = {
      ...hosted,
      order: { ...hosted.order, payment_status: "PENDING", can_pay: false },
      attempt: { ...quote, checkout_url: url, submitted: true },
    };
    const paid: BuyerCheckout = {
      ...pending,
      order: { ...pending.order, payment_status: "PAID" },
    };
    const responses = reloaded
      ? [paid]
      : [{ ...hosted, attempt: quote }, pending, paid];
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        ({
          ok: true,
          json: async () => responses.shift(),
        }) as Response,
    );
    globalThis.fetch = fetcher;
    const paymentTab = {
      closed: false,
      opener: window as Window | null,
      location: { replace: jest.fn() },
      close: jest.fn(),
    };
    const open = jest
      .spyOn(window, "open")
      .mockReturnValue(paymentTab as unknown as Window);
    const container = document.createElement("div");
    const root = createRoot(container);
    document.body.append(container);
    let current = reloaded ? pending : hosted;
    const mutate = async (data?: BuyerCheckout) => {
      if (!data) return;
      current = data;
      root.render(<Checkout orderId={hosted.order.id} />);
    };
    (useSWR as unknown as jest.Mock).mockImplementation((key: unknown) => ({
      data:
        key === "/api/v1/user"
          ? { id: "synthetic-buyer" }
          : key === null
            ? undefined
            : current,
      isLoading: false,
      mutate,
    }));

    try {
      await act(async () =>
        root.render(<Checkout orderId={hosted.order.id} />),
      );
      if (!reloaded) {
        const continueButton = [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Continue to payment",
        )!;
        await act(async () => continueButton.click());
        expect(open).toHaveBeenCalledTimes(1);
        expect(paymentTab.opener).toBeNull();
        expect(paymentTab.location.replace).toHaveBeenCalledWith(url);
        expect(paymentTab.close).not.toHaveBeenCalled();
        expect(fetcher.mock.calls.map(([request]) => request)).toEqual([
          "/api/v1/orders/synthetic-order/quote",
          "/api/v1/orders/synthetic-order/payment",
        ]);
        expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
          method: "link",
          installments: 1,
          idempotency_key: expect.any(String),
        });
        expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
          attempt_id: quote.id,
          expected_total_minor: 2500,
        });
        expect(
          container.querySelector(`a[href="${url}"]`)?.getAttribute("target"),
        ).toBe("_blank");
        expect(container.textContent).not.toContain("Continue to payment");

        await act(async () => {
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
        });
      } else {
        expect(open).not.toHaveBeenCalled();
      }
      expect(fetcher).toHaveBeenCalledTimes(reloaded ? 1 : 3);
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/v1/orders/synthetic-order",
        expect.objectContaining({
          body: JSON.stringify({ action: "reconcile" }),
        }),
      );
      expect(container.textContent).toContain("Payment confirmed");
      expect(container.querySelector(`a[href="${url}"]`)).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
      open.mockRestore();
      globalThis.fetch = previousFetch;
      if (previousHidden)
        Object.defineProperty(document, "hidden", previousHidden);
      else Reflect.deleteProperty(document, "hidden");
      reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
  },
);
