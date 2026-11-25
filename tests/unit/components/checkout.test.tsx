import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { Checkout, quoteForSelection } from "components/checkout/Checkout";
import type { BuyerCheckout } from "contracts/purchase-orders";

jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));
const checkout: BuyerCheckout = {
  order: {
    id: "synthetic-order",
    item_type: "GIFT_CARD",
    item_id: "sandbox-brl-25",
    product_name: "Demo",
    product_slug: null,
    image_url: null,
    amount_minor: 2500,
    total_minor: 2650,
    interest_minor: 150,
    installments: 3,
    currency: "BRL",
    payment_status: "UNPAID",
    delivery_status: "PENDING",
    created_at: "2026-10-12T15:00:00Z",
    gift_card_order_id: "synthetic-order",
    can_pay: true,
    can_cancel: true,
  },
  attempt: null,
  checkout: {
    available: true,
    methods: ["pix", "card"],
    installments: true,
    hosted: false,
    external_id: "synthetic-installation",
    script_url: "https://scripts.sandboxappmax.com.br/appmax.min.js",
  },
};
function render(data: BuyerCheckout) {
  (useSWR as unknown as jest.Mock).mockImplementation((key: unknown) => ({
    data:
      key === "/api/v1/user"
        ? { id: "synthetic-buyer" }
        : Array.isArray(key) && key[0].endsWith("/quote")
          ? { options: [] }
          : key === null
            ? undefined
            : data,
    isLoading: false,
    mutate: jest.fn(),
  }));
  return renderToStaticMarkup(<Checkout orderId="synthetic-order" />);
}
test("the first Pix paint already mounts the card and IP forms required by the SDK", () => {
  const html = render(checkout);
  expect(html).toContain("data-appmax-customer");
  expect(html).toMatch(/<section\b[^>]*class="[^"]*checkout-payment-panel/);
  expect(html).toContain("data-appmax-checkout");
  expect(html).toContain('name="card-number"');
  expect(html).toContain('name="exp-month"');
  expect(html).toContain('name="cvv"');
  expect(html).toContain("Cancel order");
});

const emailDelivery = {
  channel: "EMAIL" as const,
  email: "buyer@example.test",
  confirmed: false,
  recipient_ready: false,
  verification_required: false,
};

test.each([true, false])(
  "email recipient confirmation precedes payment (hosted=%s)",
  (hosted) => {
    const html = render({
      ...checkout,
      gift_card_delivery: emailDelivery,
      checkout: { ...checkout.checkout, hosted },
    });
    expect(html).toContain("Gift card delivery");
    expect(html.match(/buyer@example\.test/g)).toHaveLength(1);
    expect(html).toContain("Confirm delivery and continue");
    expect(html).not.toContain('name="recipient_document"');
    expect(html).not.toContain("Continue to payment");
    expect(html).not.toContain("Generate Pix code");
    expect(html).not.toContain('name="card-number"');
  },
);

test("unverified delivery email requires a fresh login before recipient details or payment", () => {
  const html = render({
    ...checkout,
    gift_card_delivery: { ...emailDelivery, verification_required: true },
  });
  expect(html).toContain("Verify email");
  expect(html).toContain("callbackUrl=%2Fcheckout%2Fsynthetic-order");
  expect(html).not.toContain('name="recipient_first_name"');
  expect(html).not.toContain('name="recipient_last_name"');
  expect(html).not.toContain("Generate Pix code");
});

test("saved recipient enables payment while receipt continues to show email delivery", () => {
  const delivery = { ...emailDelivery, confirmed: true, recipient_ready: true };
  const html = render({ ...checkout, gift_card_delivery: delivery });
  expect(html).toContain("Generate Pix code");
  expect(html).not.toContain(">Confirm</button>");
  expect(html).not.toContain("Confirm delivery and continue");
  expect(html.match(/buyer@example\.test/g)).toHaveLength(1);
  const receipt = render({
    ...checkout,
    gift_card_delivery: delivery,
    order: {
      ...checkout.order,
      payment_status: "PAID",
      delivery_status: "READY",
    },
  });
  expect(receipt).toContain("Delivered by email");
  expect(receipt).not.toContain("Code available");
  expect(receipt).not.toContain("View code");
});
test.each(["pix", "card"] as const)(
  "verified recipient names prefill the %s payer and permit protected document reuse",
  (method) => {
    const html = render({
      ...checkout,
      gift_card_delivery: {
        ...emailDelivery,
        confirmed: true,
        recipient_ready: true,
        document_required: true,
        recipient_first_name: "Synthetic Maria",
        recipient_last_name: "de Buyer",
      },
      checkout: {
        ...checkout.checkout,
        methods: [method],
      },
    });
    expect(html).toContain('value="Synthetic Maria"');
    expect(html).toContain('value="de Buyer"');
    expect(html).toContain("You can edit the payer details.");
    expect(html).toContain("Use the delivery document for payment");
    expect(html).toContain('name="reuse_recipient_document"');
    expect(html).toContain('checked=""');
    expect(html).not.toContain('name="document_number"');
    expect(html).not.toContain('name="recipient_document"');
  },
);

test("an old order without structured recipient names can opt into document reuse", () => {
  const html = render({
    ...checkout,
    gift_card_delivery: {
      ...emailDelivery,
      confirmed: true,
      recipient_ready: true,
      document_required: true,
    },
  });
  expect(html).toContain("Use the delivery document for payment");
  expect(html).toContain('name="reuse_recipient_document"');
  expect(html).not.toContain('checked=""');
  expect(html).toContain('name="document_number"');
  expect(html).not.toContain('name="recipient_document"');
});

test("Stripe checkout remains outside the Appmax payment panel", () => {
  const html = render({
    ...checkout,
    checkout: { ...checkout.checkout, hosted: true, methods: ["card"] },
  });
  expect(html).toContain("Continue to payment");
  expect(html).not.toMatch(/<section\b[^>]*class="[^"]*checkout-payment-panel/);
  expect(html).not.toContain("data-appmax-checkout");
});

const hostedCheckout: BuyerCheckout = {
  ...checkout,
  checkout: {
    available: true,
    hosted: true,
    payment_link: true,
    installments: false,
    methods: ["link"],
    external_id: null,
    script_url: null,
  },
};

test("the hosted payment link checkout leaves the payment method and payer details to the provider", () => {
  const html = render({
    ...hostedCheckout,
    gift_card_delivery: {
      ...emailDelivery,
      confirmed: true,
      recipient_ready: true,
      document_required: true,
    },
  });
  expect(html).toContain("Continue to payment");
  expect(html).toContain("Choose Pix or credit card on the payment page.");
  expect(html).toContain("buyer@example.test");
  expect(html).not.toContain("Generate Pix code");
  expect(html).not.toContain("data-appmax-checkout");
  expect(html).not.toContain('name="first_name"');
  expect(html).not.toContain('name="document_number"');
});

test("a pending order offers its saved payment link after the original quote expires", () => {
  const url = "https://checkout.sandboxappmax.com.br/pl/synthetic";
  const html = render({
    ...hostedCheckout,
    order: {
      ...checkout.order,
      payment_status: "PENDING",
      can_pay: false,
      can_cancel: false,
    },
    attempt: {
      id: "synthetic-attempt",
      method: "link",
      installments: 1,
      total_minor: 2500,
      interest_minor: 0,
      quote_expires_at: "2000-01-01",
      submitted: true,
      uncertain: false,
      checkout_url: url,
      pix: null,
    },
  });
  expect(html).toContain(
    `href="${url}" target="_blank" rel="noopener noreferrer"`,
  );
  expect(html).toContain("Open payment page");
  expect(html).toContain("Check payment status");
  expect(html).not.toContain("Continue to payment");
});

test("waiting for Pix keeps the QR, copy and status actions inside the payment panel", () => {
  const html = render({
    ...checkout,
    order: {
      ...checkout.order,
      payment_status: "PENDING",
      can_pay: false,
      can_cancel: false,
    },
    attempt: {
      id: "synthetic-attempt",
      method: "pix",
      installments: 1,
      total_minor: 2500,
      interest_minor: 0,
      quote_expires_at: "2026-10-12T16:00:00Z",
      submitted: true,
      uncertain: false,
      checkout_url: null,
      pix: { emv: "synthetic-pix-code", qrcode: "aGVsbG8=", expires_at: null },
    },
  });
  expect(html).toMatch(/<section\b[^>]*class="[^"]*checkout-payment-panel/);
  expect(html).toContain("Pix QR code");
  expect(html).toContain("Copy Pix code");
  expect(html).toContain("Check payment status");
});

test("only a live, unsubmitted quote for this method and installments is reusable", () => {
  const attempt = {
    id: "synthetic-quote",
    method: "card",
    installments: 3,
    total_minor: 2650,
    interest_minor: 150,
    quote_expires_at: new Date(Date.now() + 60000).toISOString(),
    submitted: false,
    uncertain: false,
    checkout_url: null,
    pix: null,
  };
  const quoted = { ...checkout, attempt };
  expect(quoteForSelection(quoted, "card", 3)).toBe(attempt);
  expect(quoteForSelection(quoted, "card", 2)).toBeNull();
  expect(quoteForSelection(quoted, "pix", 1)).toBeNull();
  expect(
    quoteForSelection(
      { ...quoted, attempt: { ...attempt, submitted: true } },
      "card",
      3,
    ),
  ).toBeNull();
  expect(
    quoteForSelection(
      { ...quoted, attempt: { ...attempt, quote_expires_at: "2000-01-01" } },
      "card",
      3,
    ),
  ).toBeNull();
});
test("a submitted uncertain payment offers status checks without another payment or local cancellation", () => {
  const html = render({
    ...checkout,
    order: {
      ...checkout.order,
      payment_status: "PROCESSING",
      can_pay: false,
      can_cancel: false,
    },
    attempt: {
      id: "synthetic-attempt",
      method: "pix",
      installments: 1,
      total_minor: 2500,
      interest_minor: 0,
      quote_expires_at: "2026-10-12T16:00:00Z",
      submitted: true,
      uncertain: true,
      checkout_url: null,
      pix: null,
    },
  });
  expect(html).toContain("Check payment status");
  expect(html).not.toContain("Generate Pix code");
  expect(html).not.toContain("Cancel order");
  expect(html).not.toContain('name="card-number"');
});
test("the receipt keeps the financed total and does not offer payment again", () => {
  const html = render({
    ...checkout,
    order: {
      ...checkout.order,
      payment_status: "PAID",
      delivery_status: "READY",
      can_pay: false,
      can_cancel: false,
    },
    attempt: {
      id: "synthetic-attempt",
      method: "card",
      installments: 3,
      total_minor: 2650,
      interest_minor: 150,
      quote_expires_at: "2026-10-12T16:00:00Z",
      submitted: true,
      uncertain: false,
      checkout_url: null,
      pix: null,
    },
  });
  expect(html).toContain("Payment confirmed");
  expect(html).toContain("R$26,50");
  expect(html).toContain("R$1,50");
  expect(html).not.toContain('name="card-number"');
  expect(html).not.toContain("Cancel order");
});
