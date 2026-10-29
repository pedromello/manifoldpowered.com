import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { useRouter } from "next/router";
import GiftCardsPage, { getServerSideProps } from "pages/library/gift-cards";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
  SWRConfig: jest.requireActual("swr").SWRConfig,
}));
jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value, locale: "en" }),
}));
const mockSWR = useSWR as unknown as jest.Mock;
const mockRouter = useRouter as jest.Mock;
const product = {
  code: "sandbox-brl-25",
  name: "Demo gift card",
  amount_minor: 2500,
  currency: "BRL",
};
const baseOrder = {
  id: "synthetic-order",
  product_code: product.code,
  product_name: product.name,
  amount_minor: 2500,
  currency: "BRL",
  created_at: "2026-10-01T00:00:00Z",
  first_revealed_at: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.mockReturnValue({ query: {} });
});
function render(
  status?: string,
  available = true,
  firstRevealedAt: string | null = null,
  delivery: Record<string, unknown> = {},
) {
  mockSWR.mockImplementation((key: string) => ({
    data:
      key === "/api/v1/gift-card-orders"
        ? {
            products: [product],
            orders: status
              ? [
                  {
                    ...baseOrder,
                    first_revealed_at: firstRevealedAt,
                    status,
                    gift_card_code:
                      status === "FULFILLED"
                        ? "SIMULATED-NOT-REDEEMABLE-fixture"
                        : null,
                    ...delivery,
                  },
                ]
              : [],
            checkout_available: available,
          }
        : undefined,
    mutate: jest.fn(),
    isLoading: false,
    error: null,
  }));
  return renderToStaticMarkup(<GiftCardsPage />);
}

test("library links to the store instead of selling products", () => {
  const html = render(undefined, false);
  expect(html).toContain("New purchases are currently unavailable.");
  expect(html).toContain("Explore gift cards");
  expect(html).not.toContain("Buy in test mode");
  expect(html).not.toContain("Available gift cards");
  expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE");
});

test("success redirect shows pending verification without delivering a gift card", () => {
  mockRouter.mockReturnValue({
    query: { checkout: "returned", order: baseOrder.id },
  });
  const html = render("AWAITING_PAYMENT");
  expect(html).toContain("We are confirming your payment.");
  expect(html).toContain("Awaiting payment confirmation");
  expect(html).toContain("Continue purchase");
  expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE");
});

test("previously revealed purchases offer direct viewing without exposing audit details", () => {
  const html = render("FULFILLED", true, "2026-10-10T14:23:45Z");
  expect(html).not.toContain("First revealed on");
  expect(html).not.toContain("2026-10-10T14:23:45Z");
  expect(html).toContain("View code");
  expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE-fixture");
});

test("confirmed delivery does not show a pending checkout notice", () => {
  mockRouter.mockReturnValue({ query: { checkout: "returned" } });
  for (const status of ["FULFILLED", "PAID", "ISSUANCE_FAILED"]) {
    expect(render(status)).not.toContain("We are confirming your payment.");
  }
});

test("paid issuance failure offers delivery retry without a checkout action", () => {
  const html = render("ISSUANCE_FAILED");
  expect(html).toContain("You do not need to pay again.");
  expect(html).toContain("Retry delivery");
  expect(html).not.toContain("Continue purchase");
});

test("delivered code is hidden even if a stale payload contains it", () => {
  const html = render("FULFILLED");
  expect(html).toContain("Gift card delivered");
  expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE-fixture");
  expect(html).toContain("Reveal code");
  expect(html).not.toContain("Retry delivery");
});

test("anonymous and unactivated users receive actionable states", () => {
  for (const [status, text] of [
    [401, "Log in to see your purchases"],
    [403, "Activate your account to buy gift cards."],
  ] as const) {
    mockSWR.mockReturnValue({ error: { status }, isLoading: false });
    expect(renderToStaticMarkup(<GiftCardsPage />)).toContain(text);
  }
});

test.each([
  ["PROCESSING", "PAID", "Payment confirmed · email delivery pending"],
  ["DELIVERED", "FULFILLED", "Delivered by email"],
  ["CANCELLED", "ISSUANCE_FAILED", "Delivery cancelled · support required"],
  ["REVIEW", "ISSUANCE_FAILED", "Delivery needs review"],
])(
  "email %s presents delivery status without code or issuance controls",
  (fulfillment, status, label) => {
    const html = render(status, true, "2026-10-10T14:23:45Z", {
      delivery_channel: "EMAIL",
      recipient_email: "buyer@example.test",
      fulfillment_status: fulfillment,
      next_tracking_at:
        fulfillment === "PROCESSING" ? "2026-10-11T10:00:00Z" : null,
    });
    expect(html).toContain(label);
    expect(html).toContain("buyer@example.test");
    expect(html).not.toContain("Reveal code");
    expect(html).not.toContain("View code");
    expect(html).not.toContain("Retry delivery");
    expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE-fixture");
    if (fulfillment === "PROCESSING")
      expect(html).toContain("Next delivery check");
    if (["CANCELLED", "REVIEW"].includes(fulfillment))
      expect(html).toContain("Do not pay again.");
  },
);

test("pending email purchase goes through checkout for recipient confirmation", () => {
  const html = render("CHECKOUT_PENDING", true, null, {
    delivery_channel: "EMAIL",
  });
  expect(html).toContain('href="/checkout/synthetic-order"');
  expect(html).toContain("Complete your payment to receive your gift card.");
  expect(html).not.toContain("You do not need to pay again.");
});

test("unpaid cancelled email order does not promise a future delivery", () => {
  const html = render("CANCELLED", true, null, {
    delivery_channel: "EMAIL",
    fulfillment_status: "QUEUED",
    paid_at: null,
  });
  expect(html).toContain(
    "This purchase was cancelled. No payment was completed.",
  );
  expect(html).not.toContain("Delivery updates appear here automatically.");
  expect(html).not.toContain("You do not need to pay again.");
  expect(html).not.toContain("Continue purchase");
});

test("failed email payment offers checkout recovery without claiming delivery is under way", () => {
  const html = render("PAYMENT_FAILED", true, null, {
    delivery_channel: "EMAIL",
    fulfillment_status: "QUEUED",
    paid_at: null,
  });
  expect(html).toContain("Your payment was unsuccessful. You can try again.");
  expect(html).toContain('href="/checkout/synthetic-order"');
  expect(html).toContain("Try again");
  expect(html).not.toContain("Delivery updates appear here automatically.");
  expect(html).not.toContain("You do not need to pay again.");
  expect(html).not.toContain("Retry delivery");
});

test("cancelled email order with prior payment directs the buyer to support", () => {
  const html = render("CANCELLED", true, null, {
    delivery_channel: "EMAIL",
    fulfillment_status: "PROCESSING",
    paid_at: "2026-10-10T14:23:45Z",
  });
  expect(html).toContain("Purchase under review");
  expect(html).toContain(
    "Do not pay again. Contact support with your order number.",
  );
  expect(html).not.toContain("No payment was completed.");
});

test("production renders 404 rather than exposing a simulated gift card store", async () => {
  const original = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "production", APP_ENV: "production" });
  try {
    expect(await getServerSideProps()).toEqual({ notFound: true });
  } finally {
    process.env = original;
  }
});

test("an enabled sandbox homologation build exposes purchase history", async () => {
  const original = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "production",
    APP_ENV: "hml",
    PURCHASES_ENABLED: "true",
    PAYMENT_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER: "api",
  });
  try {
    expect(await getServerSideProps()).toEqual({ props: {} });
  } finally {
    process.env = original;
  }
});
