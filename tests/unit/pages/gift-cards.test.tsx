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
  gift_card_code: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.mockReturnValue({ query: {} });
});
function render(status?: string, available = true) {
  mockSWR.mockImplementation((key: string) => ({
    data:
      key === "/api/v1/gift-card-orders"
        ? {
            products: [product],
            orders: status
              ? [
                  {
                    ...baseOrder,
                    status,
                    gift_card_code:
                      status === "FULFILLED"
                        ? "SIMULATED-NOT-REDEEMABLE-fixture"
                        : null,
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

test("missing credentials keep test purchase buttons disabled and explain availability", () => {
  const html = render(undefined, false);
  expect(html).toContain("Test checkout is unavailable.");
  expect(html).toContain('disabled=""');
  expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE");
});

test("success redirect shows pending verification without delivering a gift card", () => {
  mockRouter.mockReturnValue({ query: { checkout: "returned" } });
  const html = render("AWAITING_PAYMENT");
  expect(html).toContain("Your return from checkout does not confirm payment.");
  expect(html).toContain("Awaiting payment confirmation");
  expect(html).toContain("Resume checkout");
  expect(html).not.toContain("SIMULATED-NOT-REDEEMABLE");
});

test("paid issuance failure offers delivery retry without a checkout action", () => {
  const html = render("ISSUANCE_FAILED");
  expect(html).toContain("You do not need to pay again.");
  expect(html).toContain("Retry delivery");
  expect(html).not.toContain("Resume checkout");
});

test("delivered demo card is visible only in the fulfilled state", () => {
  const html = render("FULFILLED");
  expect(html).toContain("Gift card delivered");
  expect(html).toContain("SIMULATED-NOT-REDEEMABLE-fixture");
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

test("production renders 404 rather than exposing a simulated gift card store", async () => {
  const original = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    expect(await getServerSideProps()).toEqual({ notFound: true });
  } finally {
    Object.assign(process.env, { NODE_ENV: original });
  }
});
