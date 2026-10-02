import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Stripe from "stripe";
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import purchaseHandler from "pages/api/v1/gift-card-orders";
import detailHandler from "pages/api/v1/gift-card-orders/[id]";
import revealHandler from "pages/api/v1/gift-card-orders/[id]/reveal";
import webhookHandler from "pages/api/v1/webhooks/stripe";
import { stripeCheckoutGateway } from "infra/stripe_checkout";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";
import {
  checkoutFixture,
  paymentEvent,
} from "tests/fixtures/gift_card_checkout";

// Real controllers/authentication/models/PostgreSQL; synthetic external
// boundaries only. The SDK verifies signatures, not an authenticated payment.
const stripe = new Stripe("sk_test_synthetic_usecase");
const secret = "whsec_synthetic_usecase";
const env = { ...process.env };
let buyer: string;
let cookie: string;
let fixture: ReturnType<typeof checkoutFixture>;
let log: jest.SpyInstance;
const buyers: string[] = [];
beforeEach(async () => {
  const user = await orchestrator.createUser();
  buyers.push(user.id);
  buyer = user.id;
  await orchestrator.activateUser(buyer);
  cookie = (await orchestrator.createSession(buyer)).token;
  fixture = checkoutFixture();
  jest
    .spyOn(stripeCheckoutGateway, "create")
    .mockImplementation(fixture.gateway.create);
  jest
    .spyOn(stripeCheckoutGateway, "retrieve")
    .mockImplementation(fixture.gateway.retrieve);
  jest
    .spyOn(stripeCheckoutGateway, "expire")
    .mockImplementation(fixture.gateway.expire);
  const issue = simulatedGiftCardProvider.issue;
  fixture.provider.issue.mockImplementation(async (request) => {
    const result =
      fixture.deliveries.get(request.request_id) ?? (await issue(request));
    fixture.deliveries.set(request.request_id, result);
    return result;
  });
  jest
    .spyOn(simulatedGiftCardProvider, "issue")
    .mockImplementation(fixture.provider.issue);
  jest
    .spyOn(simulatedGiftCardProvider, "reconcile")
    .mockImplementation(fixture.provider.reconcile);
  process.env.STRIPE_SECRET_KEY = "sk_test_synthetic_usecase";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  log = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...env };
});
afterAll(async () => {
  const orders = await prisma.giftCardOrder.findMany({
    where: { user_id: { in: buyers } },
    select: { id: true },
  });
  await prisma.giftCardPaymentEvent.deleteMany({
    where: { order_id: { in: orders.map((o) => o.id) } },
  });
  await prisma.libraryItem.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.giftCardOrder.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.session.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.userActivationToken.deleteMany({
    where: { user_id: { in: buyers } },
  });
  await prisma.user.deleteMany({ where: { id: { in: buyers } } });
  await prisma.$disconnect();
});
async function call(
  handler: typeof purchaseHandler,
  {
    id,
    body,
    token = cookie,
    method = "POST",
    raw,
    signature,
  }: {
    id?: string;
    body?: unknown;
    token?: string;
    method?: string;
    raw?: string;
    signature?: string;
  } = {},
) {
  const req = Readable.from(raw ? [raw] : []) as NextApiRequest;
  Object.assign(req, {
    method,
    body,
    query: id ? { id } : {},
    cookies: token ? { session_id: token } : {},
    headers: signature ? { "stripe-signature": signature } : {},
    url: "/api/v1/gift-card-orders",
  });
  const result = {
    status: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  const res = {
    status: (value: number) => {
      result.status = value;
      return res;
    },
    json: (value: unknown) => {
      result.body = JSON.parse(JSON.stringify(value));
      return res;
    },
    setHeader: (key: string, value: string) => {
      result.headers[key] = value;
      return res;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return result;
}
async function buy() {
  return call(purchaseHandler, {
    body: { product_code: "sandbox-brl-25", idempotency_key: randomUUID() },
  });
}
async function notify(id: string, eventId?: string) {
  const raw = JSON.stringify(
    paymentEvent(fixture.pay(id), "checkout.session.completed", eventId),
  );
  return call(webhookHandler, {
    raw,
    signature: stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret,
    }),
  });
}
const responseId = (result: Awaited<ReturnType<typeof call>>) =>
  (result.body as { id: string }).id;

test("purchase, signed webhook, delivery, library and explicit disclosure compose correctly", async () => {
  const purchase = await buy();
  expect(purchase.status).toBe(200);
  const id = responseId(purchase);
  expect(purchase.body).not.toHaveProperty("gift_card_code");
  expect((await notify(id)).status).toBe(200);
  const listing = await call(purchaseHandler, { method: "GET" });
  const detail = await call(detailHandler, { id, method: "GET" });
  const mutation = await call(detailHandler, {
    id,
    body: { action: "retry_issuance" },
  });
  for (const response of [listing, detail, mutation]) {
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toContain("gift_card_code");
    expect(JSON.stringify(response.body)).not.toContain(
      "SIMULATED-NOT-REDEEMABLE",
    );
  }
  expect(
    await prisma.libraryItem.count({ where: { item_id: id, user_id: buyer } }),
  ).toBe(1);
  expect(
    (await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }))
      .first_revealed_at,
  ).toBeNull();
  expect((await call(revealHandler, { id, method: "GET" })).status).toBe(405);
  expect(
    (await call(revealHandler, { id, body: { confirm: false } })).status,
  ).toBe(400);
  const reveal = await call(revealHandler, { id, body: { confirm: true } });
  expect(reveal.status).toBe(200);
  expect(reveal.headers["Cache-Control"]).toBe("no-store");
  expect(reveal.body).toMatchObject({
    gift_card_code: expect.stringContaining("SIMULATED-NOT-REDEEMABLE"),
    first_revealed_at: expect.any(String),
  });
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
  expect(log).not.toHaveBeenCalled();
});

test("delivery failure returns 503 after committing payment; replay recovers without charge", async () => {
  const id = responseId(await buy());
  fixture.provider.issue.mockRejectedValueOnce(
    new Error("synthetic-secret-supplier-error"),
  );
  expect((await notify(id, "evt_fixture_replay")).status).toBe(503);
  expect(
    await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ paid_at: expect.any(Date), status: "ISSUANCE_FAILED" });
  expect(
    await prisma.giftCardPaymentEvent.count({
      where: { id: "evt_fixture_replay" },
    }),
  ).toBe(1);
  expect((await notify(id, "evt_fixture_replay")).status).toBe(200);
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "synthetic-secret-supplier-error",
  );
});

test("malformed supplier data and persistence failure cannot leak codes to logs or responses", async () => {
  const id = responseId(await buy());
  const code = "synthetic-secret-malformed";
  fixture.provider.issue.mockResolvedValueOnce({ reference: 1, code } as never);
  const failed = await notify(id);
  expect(failed.status).toBe(503);
  expect(
    JSON.stringify(failed.body) + JSON.stringify(log.mock.calls),
  ).not.toContain(code);
  const issue = fixture.provider.issue.getMockImplementation()!;
  fixture.provider.issue.mockImplementationOnce(async (request) => {
    const delivery = await issue(request);
    await prisma.giftCardOrder.create({
      data: {
        user_id: buyer,
        idempotency_key: randomUUID(),
        product_code: "collision",
        product_name: "Demo",
        amount_minor: 2500,
        currency: "BRL",
        status: "CANCELLED",
        provider_reference: delivery.reference,
      },
    });
    return delivery;
  });
  const failedPersistence = await call(detailHandler, {
    id,
    body: { action: "retry_issuance" },
  });
  expect(failedPersistence.status).toBe(503);
  const secretCode = fixture.deliveries.get(id)!.code;
  expect(
    JSON.stringify(failedPersistence.body) + JSON.stringify(log.mock.calls),
  ).not.toContain(secretCode);
});

test("missing webhook is recovered by one authenticated detail-entry action", async () => {
  const id = responseId(await buy());
  fixture.pay(id);
  const reconciled = await call(detailHandler, {
    id,
    body: { action: "reconcile_payment" },
  });
  expect(reconciled.status).toBe(200);
  expect(reconciled.body).toMatchObject({ status: "FULFILLED" });
  expect(reconciled.body).not.toHaveProperty("gift_card_code");
  expect(
    await prisma.giftCardPaymentEvent.count({ where: { order_id: id } }),
  ).toBe(0);
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
});

test("unauthenticated or different buyer cannot reconcile or reveal", async () => {
  const id = responseId(await buy());
  await notify(id);
  expect(
    (await call(revealHandler, { id, token: "", body: { confirm: true } }))
      .status,
  ).toBe(401);
  const other = await orchestrator.createUser();
  buyers.push(other.id);
  await orchestrator.activateUser(other.id);
  const token = (await orchestrator.createSession(other.id)).token;
  expect(
    (await call(revealHandler, { id, token, body: { confirm: true } })).status,
  ).toBe(404);
  expect(
    (
      await call(detailHandler, {
        id,
        token,
        body: { action: "reconcile_payment" },
      })
    ).status,
  ).toBe(404);
  expect(
    (await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }))
      .first_revealed_at,
  ).toBeNull();
});

test("payment confirmation concurrent with cancellation never loses the paid state", async () => {
  const id = responseId(await buy());
  fixture.pay(id);
  const results = await Promise.all([
    call(detailHandler, { id, body: { action: "cancel" } }),
    notify(id),
  ]);
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(
    await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ status: "FULFILLED", paid_at: expect.any(Date) });
  expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
});
