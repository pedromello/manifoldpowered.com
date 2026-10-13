import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { Checkout } from "components/checkout/Checkout";
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
  expect(html).toContain("data-appmax-checkout");
  expect(html).toContain('name="card-number"');
  expect(html).toContain('name="exp-month"');
  expect(html).toContain('name="cvv"');
  expect(html).toContain("Cancel order");
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
