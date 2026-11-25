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

test.each(["fresh", "reloaded", "rejected", "uncertain"] as const)(
  "the hosted checkout prepares and verifies the payment link (%s)",
  async (scenario) => {
    const reloaded = scenario === "reloaded";
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
    const retryQuote = { ...quote, id: "synthetic-retry-link-attempt" };
    const url = "https://checkout.sandboxappmax.com.br/pl/synthetic";
    const pending: BuyerCheckout = {
      ...hosted,
      order: { ...hosted.order, payment_status: "PENDING", can_pay: false },
      attempt: {
        ...(scenario === "rejected" ? retryQuote : quote),
        checkout_url: url,
        submitted: true,
      },
    };
    const paid: BuyerCheckout = {
      ...pending,
      order: { ...pending.order, payment_status: "PAID" },
    };
    const rejected: BuyerCheckout = {
      ...hosted,
      order: { ...hosted.order, payment_status: "FAILED" },
      attempt: { ...quote, submitted: true },
    };
    const uncertain: BuyerCheckout = {
      ...pending,
      attempt: { ...quote, submitted: true, uncertain: true },
    };
    const responses = {
      reloaded: [paid],
      fresh: [pending, paid],
      rejected: [rejected, { ...hosted, attempt: retryQuote }, pending, paid],
      uncertain: [uncertain],
    }[scenario];
    const reply = (value?: BuyerCheckout) =>
      ({ ok: true, json: async () => value }) as Response;
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => reply(responses.shift()),
    );
    let resolveQuote: (response: Response) => void = () => {};
    if (!reloaded)
      fetcher.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveQuote = resolve;
          }),
      );
    globalThis.fetch = fetcher;
    const open = jest.spyOn(window, "open").mockReturnValue(null);
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
        expect(continueButton.disabled).toBe(true);
        expect(container.textContent).toContain("Preparing payment link…");
        await act(async () => continueButton.click());
        expect(fetcher).toHaveBeenCalledTimes(1);
        await act(async () =>
          resolveQuote(reply({ ...hosted, attempt: quote })),
        );
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
        const retryButton = [...container.querySelectorAll("button")].find(
          (button) => button.textContent === "Prepare payment link again",
        );
        if (scenario === "uncertain") {
          expect(retryButton).toBeUndefined();
          expect(container.querySelector(`a[href="${url}"]`)).toBeNull();
          expect(container.textContent).toContain("Check payment status");
          expect(open).not.toHaveBeenCalled();
          return;
        }
        if (scenario === "rejected") {
          expect(container.textContent).not.toContain("Payment failed.");
          expect(container.textContent).toContain(
            "We could not prepare your payment link.",
          );
          expect(fetcher).toHaveBeenCalledTimes(2);
          await act(async () => retryButton!.click());
          expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({
            attempt_id: retryQuote.id,
            expected_total_minor: 2500,
          });
        } else {
          expect(retryButton).toBeUndefined();
        }
        const preparationRequests = scenario === "rejected" ? 4 : 2;
        expect(fetcher).toHaveBeenCalledTimes(preparationRequests);
        const continueLink = container.querySelector<HTMLAnchorElement>(
          `a[href="${url}"]`,
        )!;
        expect(continueLink.target).toBe("_blank");
        expect(continueLink.textContent).toBe("Continue to payment");
        expect(container.querySelector("section h2")?.textContent).toBe(
          "Payment method",
        );
        continueLink.addEventListener("click", (event) =>
          event.preventDefault(),
        );
        await act(async () => continueLink.click());
        expect(fetcher).toHaveBeenCalledTimes(preparationRequests);

        await act(async () => {
          window.dispatchEvent(new Event("focus"));
          document.dispatchEvent(new Event("visibilitychange"));
        });
      }
      expect(open).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(
        reloaded ? 1 : scenario === "rejected" ? 5 : 3,
      );
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
