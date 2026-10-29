import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { OrdersList } from "components/orders/OrdersList";
import type { BuyerOrder } from "contracts/purchase-orders";

jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value, locale: "en" }),
}));

const order: BuyerOrder = {
  id: "synthetic-order",
  item_type: "GIFT_CARD",
  item_id: "synthetic-product",
  product_name: "Gift card",
  product_slug: null,
  image_url: null,
  amount_minor: 2500,
  total_minor: 2500,
  interest_minor: 0,
  installments: 1,
  currency: "BRL",
  payment_status: "PAID",
  delivery_status: "READY",
  created_at: "2026-10-12T15:00:00Z",
  gift_card_order_id: "synthetic-order",
  can_pay: false,
  can_cancel: false,
  gift_card_delivery: {
    channel: "EMAIL",
    email: "buyer@example.test",
    status: "DELIVERED",
  },
};

function render(deliveryStatus = "READY") {
  (useSWR as unknown as jest.Mock).mockImplementation((key: unknown) => ({
    data:
      key === "/api/v1/user"
        ? { id: "synthetic-buyer" }
        : { orders: [{ ...order, delivery_status: deliveryStatus }] },
    mutate: jest.fn(),
    isLoading: false,
  }));
  return renderToStaticMarkup(<OrdersList />);
}

test("delivered email orders open delivery details and show the snapshotted address", () => {
  const html = render();
  expect(html).toContain("Delivered by email");
  expect(html).toContain("View delivery");
  expect(html).toContain("buyer@example.test");
  expect(html).not.toContain("View code");
  expect(html).not.toContain("Code available");
});

test("paid email orders still awaiting supplier delivery are not labelled delivered", () => {
  const html = render("PENDING");
  expect(html).toContain("Preparing email delivery");
  expect(html).not.toContain("Delivered by email");
  expect(html).not.toContain("View code");
});
