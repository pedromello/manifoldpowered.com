import { Readable } from "node:stream";
import Stripe from "stripe";
import type { NextApiRequest, NextApiResponse } from "next";
import handler, { config } from "pages/api/v1/webhooks/stripe";
import giftCardOrder from "models/gift_card_order";

jest.mock("models/gift_card_order", () => ({
  __esModule: true,
  default: { receive: jest.fn() },
}));
const secret = "whsec_synthetic_webhook_fixture";
const stripe = new Stripe("sk_test_synthetic_signature_fixture");
const original = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_signature_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
});
afterEach(() => {
  process.env = { ...original };
});

async function call({
  signature,
  body,
  method = "POST",
}: {
  signature?: string;
  body: string | Buffer;
  method?: string;
}) {
  const req = Readable.from([body]) as NextApiRequest;
  Object.assign(req, {
    method,
    headers: signature ? { "stripe-signature": signature } : {},
    url: "/api/v1/webhooks/stripe",
  });
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  await handler(req, res);
  return res;
}
const payload = (livemode = false) =>
  JSON.stringify({
    id: "evt_fixture_signed",
    type: "checkout.session.completed",
    livemode,
    data: { object: { id: "cs_test_fixture" } },
  });
const sign = (body: string, timestamp?: number) =>
  stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
    timestamp,
  });

test("uses the untouched raw body and accepts a correctly signed test notification", async () => {
  expect(config.api.bodyParser).toBe(false);
  const body = payload();
  const res = await call({ body, signature: sign(body) });
  expect(res.status).toHaveBeenCalledWith(200);
  expect(giftCardOrder.receive).toHaveBeenCalledWith(
    expect.objectContaining({ id: "evt_fixture_signed", livemode: false }),
  );
});

test.each(["missing", "tampered", "expired", "live"])(
  "rejects %s webhook before payment processing",
  async (kind) => {
    const body = payload(kind === "live");
    const signature =
      kind === "missing"
        ? undefined
        : sign(
            body,
            kind === "expired"
              ? Math.floor(Date.now() / 1000) - 600
              : undefined,
          );
    const res = await call({
      body: kind === "tampered" ? body + " " : body,
      signature,
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(giftCardOrder.receive).not.toHaveBeenCalled();
  },
);

test("rejects oversized webhook bodies", async () => {
  const res = await call({
    body: Buffer.alloc(1024 * 1024 + 1),
    signature: "synthetic",
  });
  expect(res.status).toHaveBeenCalledWith(400);
  expect(giftCardOrder.receive).not.toHaveBeenCalled();
});

test("does not accept webhook GET requests", async () => {
  const res = await call({ method: "GET", body: "" });
  expect(res.status).toHaveBeenCalledWith(405);
});
