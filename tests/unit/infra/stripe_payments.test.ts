import { stripeCheckoutGateway } from "infra/stripe_checkout";
import { stripePaymentProvider } from "infra/payments/stripe";
import type { PaymentContext } from "infra/payments/types";

jest.mock("infra/stripe_checkout", () => ({
  stripeCheckoutConfigured: () => true,
  stripeCheckoutGateway: {
    create: jest.fn(),
    retrieve: jest.fn(),
    expire: jest.fn(),
  },
}));
const input: PaymentContext = {
  order_id: "synthetic-order",
  attempt_id: "synthetic-attempt",
  product_name: "Game",
  product_code: "synthetic-game",
  method: "card",
  amount_minor: 2500,
  currency: "BRL",
  installments: 1,
  remote_order_id: "cs_test_synthetic",
};
const session = {
  id: input.remote_order_id,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  livemode: false,
  client_reference_id: input.order_id,
  metadata: { order_id: input.order_id },
  amount_total: 2500,
  currency: "brl",
  expires_at: 1791932400,
  payment_intent: {
    id: "pi_synthetic",
    latest_charge: { amount_refunded: 0, disputed: false },
  },
};
beforeEach(() => jest.clearAllMocks());
test("cancellation cannot expire a payment that is already confirmed", async () => {
  (stripeCheckoutGateway.retrieve as jest.Mock).mockResolvedValue(session);
  expect((await stripePaymentProvider.cancel!(input)).state).toBe("PAID");
  expect(stripeCheckoutGateway.expire).not.toHaveBeenCalled();
});
test.each([
  [false, 0, "PAID"],
  [false, 2500, "REFUNDED"],
  [true, 0, "DISPUTED"],
])(
  "authoritative Stripe retrieval normalizes payment reversals",
  async (disputed, refunded, state) => {
    (stripeCheckoutGateway.retrieve as jest.Mock).mockResolvedValue({
      ...session,
      payment_intent: {
        id: "pi_synthetic",
        latest_charge: { disputed, amount_refunded: refunded },
      },
    });
    expect(await stripePaymentProvider.retrieve(input)).toMatchObject({
      state,
      total_minor: 2500,
      remote_payment_id: "pi_synthetic",
    });
  },
);
test.each([
  { livemode: true },
  { amount_total: 1 },
  { client_reference_id: "foreign-order" },
  { url: "https://example.test/checkout" },
])("unsafe Stripe sessions cannot grant a purchase", async (change) => {
  (stripeCheckoutGateway.retrieve as jest.Mock).mockResolvedValue({
    ...session,
    ...change,
  });
  await expect(stripePaymentProvider.retrieve(input)).rejects.toThrow();
});
