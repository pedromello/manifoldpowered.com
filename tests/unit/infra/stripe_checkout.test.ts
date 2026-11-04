import Stripe from "stripe";
import {
  stripeCheckoutGateway,
  stripeCheckoutConfigured,
} from "infra/stripe_checkout";

jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));
const constructor = Stripe as unknown as jest.Mock;
const original = { ...process.env };
const create = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_synthetic_fixture";
  process.env.STRIPE_CHECKOUT_ORIGIN = "http://localhost:3000";
  constructor.mockImplementation(() => ({
    checkout: { sessions: { create, retrieve: jest.fn(), expire: jest.fn() } },
  }));
});
afterEach(() => {
  process.env = { ...original };
});
const input = {
  order_id: "synthetic-order",
  product: {
    code: "sandbox-brl-25",
    name: "Demo gift card",
    amount_minor: 2500,
    currency: "BRL",
  },
};

test("creates hosted test checkout with a server amount, stable key and linked payment metadata", async () => {
  create.mockResolvedValue({ id: "cs_test_fixture" });
  await stripeCheckoutGateway.create(input);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "payment",
      adaptive_pricing: { enabled: false },
      allowed_payment_method_types: ["card"],
      client_reference_id: input.order_id,
      metadata: { purchase_type: "gift_card", order_id: input.order_id },
      payment_intent_data: {
        metadata: { purchase_type: "gift_card", order_id: input.order_id },
      },
      line_items: [
        {
          price_data: {
            currency: "brl",
            unit_amount: 2500,
            product_data: { name: "Demo gift card" },
          },
          quantity: 1,
        },
      ],
      success_url:
        "http://localhost:3000/library/gift-cards?order=synthetic-order&checkout=returned",
    }),
    { idempotencyKey: "gift-card-checkout:synthetic-order" },
  );
});

test.each([undefined, "sk_live_synthetic_fixture"])(
  "never calls Stripe with missing or live credentials",
  async (key) => {
    if (key) process.env.STRIPE_SECRET_KEY = key;
    else delete process.env.STRIPE_SECRET_KEY;
    expect(stripeCheckoutConfigured()).toBe(false);
    await expect(stripeCheckoutGateway.create(input)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(constructor).not.toHaveBeenCalled();
  },
);

test("requires a webhook secret before creating a checkout", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  await expect(stripeCheckoutGateway.create(input)).rejects.toMatchObject({
    statusCode: 503,
  });
  expect(create).not.toHaveBeenCalled();
});

test("is disabled in production, even with test credentials", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  await expect(stripeCheckoutGateway.create(input)).rejects.toMatchObject({
    statusCode: 503,
  });
  expect(create).not.toHaveBeenCalled();
});

test.each([
  "https://example.test/path",
  "https://user:password@example.test",
  "http://example.test",
  "javascript:alert(1)",
])("rejects unsafe configured origins: %s", async (origin) => {
  process.env.STRIPE_CHECKOUT_ORIGIN = origin;
  await expect(stripeCheckoutGateway.create(input)).rejects.toMatchObject({
    statusCode: 503,
  });
  expect(create).not.toHaveBeenCalled();
});

test("sanitizes Stripe failures without storing or logging SDK error content", async () => {
  create.mockRejectedValueOnce(new Error("sensitive synthetic error body"));
  try {
    await stripeCheckoutGateway.create(input);
    throw new Error("Expected failure");
  } catch (error) {
    expect(error).toMatchObject({
      statusCode: 503,
      message: "Stripe test checkout is temporarily unavailable.",
    });
    expect((error as Error).cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("sensitive");
  }
});
