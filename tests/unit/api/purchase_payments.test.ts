import type { NextApiRequest, NextApiResponse } from "next";
import orders from "models/purchase_order";
import { prisma } from "infra/database";
import createHandler from "pages/api/v1/orders";
import paymentHandler from "pages/api/v1/orders/[id]/payment";
import detailHandler from "pages/api/v1/orders/[id]";
import webhookHandler from "pages/api/v1/webhooks/appmax/[token]";
import { enqueuePaymentSignal } from "models/purchase_order";
import { NotFoundError } from "infra/errors";

jest.mock("models/purchase_order", () => ({
  __esModule: true,
  default: {
    begin: jest.fn(),
    findOwn: jest.fn(),
    submit: jest.fn(),
    view: jest.fn(),
    listOwn: jest.fn(),
  },
  enqueuePaymentSignal: jest.fn(),
}));
jest.mock("infra/database", () => ({
  prisma: {
    user: { findUniqueOrThrow: jest.fn() },
    purchasePaymentAttempt: { findMany: jest.fn() },
    purchaseOrder: { findMany: jest.fn() },
  },
}));
const orderId = "7a330000-0000-4000-8000-000000000001";
const originalToken = process.env.APPMAX_WEBHOOK_TOKEN;
beforeEach(() => {
  jest.clearAllMocks();
  (orders.findOwn as jest.Mock).mockResolvedValue({
    id: orderId,
    payment_provider: "appmax",
  });
  (orders.view as jest.Mock).mockResolvedValue({ order: { id: orderId } });
  (orders.submit as jest.Mock).mockResolvedValue({ order: { id: orderId } });
  (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    email: "account@example.test",
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalToken) process.env.APPMAX_WEBHOOK_TOKEN = originalToken;
  else delete process.env.APPMAX_WEBHOOK_TOKEN;
});

async function call(
  handler: typeof paymentHandler,
  body: unknown,
  method = "POST",
  query: Record<string, string> = { id: orderId },
  authenticated = true,
) {
  const req = {
    method,
    body,
    query,
    headers: {},
    url: "/api/v1/orders",
    context: {
      user: authenticated
        ? {
            id: "synthetic-buyer",
            features: ["read:library", "create:library"],
          }
        : { features: [] },
    },
  } as unknown as NextApiRequest;
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  // Use handler.run to retain validation and authorization with the prepared test session.
  await handler(req, res as unknown as NextApiResponse);
  return res;
}

jest.mock("infra/controller", () => {
  const actual = jest.requireActual("infra/controller").default;
  return {
    __esModule: true,
    default: {
      ...actual,
      injectAnonymousOrUser: async (
        _req: NextApiRequest,
        _res: NextApiResponse,
        next: () => Promise<void>,
      ) => next(),
    },
  };
});
test("anonymous requests cannot create orders", async () => {
  const res = await call(
    createHandler,
    { item_type: "GAME", item_id: "synthetic-game", idempotency_key: orderId },
    "POST",
    {},
    false,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(orders.begin).not.toHaveBeenCalled();
});
test("client prices are rejected instead of overriding server pricing", async () => {
  const res = await call(createHandler, {
    item_type: "GIFT_CARD",
    item_id: "synthetic-product",
    idempotency_key: orderId,
    amount_minor: 1,
  });
  expect(res.status).toHaveBeenCalledWith(400);
  expect(orders.begin).not.toHaveBeenCalled();
});
test("a foreign order never reaches payment submission", async () => {
  (orders.findOwn as jest.Mock).mockRejectedValue(
    new NotFoundError({ message: "Order not found." }),
  );
  (orders.view as jest.Mock).mockRejectedValue(
    new NotFoundError({ message: "Order not found." }),
  );
  const res = await call(detailHandler, undefined, "GET");
  expect(res.status).toHaveBeenCalledWith(404);
  expect(orders.view).toHaveBeenCalledWith("synthetic-buyer", orderId);
  const payment = await call(paymentHandler, {
    attempt_id: "synthetic-attempt",
    expected_total_minor: 2500,
    buyer: {
      first_name: "Synthetic",
      last_name: "Buyer",
      phone: "11999999999",
      document_number: "19100000000",
      ip: "192.0.2.1",
    },
  });
  expect(payment.status).toHaveBeenCalledWith(404);
  expect(orders.submit).not.toHaveBeenCalled();
});
test.each([
  { number: "4000000000000010", cvv: "123" },
  {
    buyer: {
      first_name: "Synthetic",
      last_name: "Buyer",
      phone: "11999999999",
      document_number: "19100000000",
      ip: "192.0.2.1",
      cvv: "123",
    },
  },
])(
  "raw card fields are rejected without logging payment input",
  async (extra) => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(paymentHandler, {
      attempt_id: "synthetic-attempt",
      expected_total_minor: 2500,
      ...extra,
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(orders.submit).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  },
);
test("buyer email comes from the authenticated account", async () => {
  const res = await call(paymentHandler, {
    attempt_id: "synthetic-attempt",
    expected_total_minor: 2500,
    card_token: "synthetic-token",
    buyer: {
      first_name: "Synthetic",
      last_name: "Buyer",
      phone: "11999999999",
      document_number: "19100000000",
      ip: "192.0.2.1",
    },
  });
  expect(res.status).toHaveBeenCalledWith(200);
  expect(orders.submit).toHaveBeenCalledWith(
    "synthetic-buyer",
    orderId,
    expect.objectContaining({
      buyer: expect.objectContaining({ email: "account@example.test" }),
    }),
  );
});
test("untrusted Appmax webhook requires a private token and a known sandbox binding", async () => {
  process.env.APPMAX_WEBHOOK_TOKEN =
    "synthetic-webhook-secret-at-least-32-characters";
  const invalid = await call(
    webhookHandler,
    { event: "OrderPaid", data: { id: 29 } },
    "POST",
    { token: "invalid" },
  );
  expect(invalid.status).toHaveBeenCalledWith(404);
  expect(enqueuePaymentSignal).not.toHaveBeenCalled();
  (prisma.purchasePaymentAttempt.findMany as jest.Mock).mockResolvedValue([
    { id: "synthetic-attempt", order_id: orderId },
  ]);
  (prisma.purchaseOrder.findMany as jest.Mock).mockResolvedValue([
    { id: orderId },
  ]);
  const valid = await call(
    webhookHandler,
    {
      environment: "production",
      event: "OrderPaid",
      data: { id: 29, status: "aprovado", total: 1 },
    },
    "POST",
    { token: process.env.APPMAX_WEBHOOK_TOKEN },
  );
  expect(valid.status).toHaveBeenCalledWith(200);
  expect(enqueuePaymentSignal).toHaveBeenCalledWith(
    orderId,
    "synthetic-attempt",
  );
  expect(orders.submit).not.toHaveBeenCalled();
  expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        payment_provider: "appmax",
        payment_environment: "sandbox",
      }),
    }),
  );
});
