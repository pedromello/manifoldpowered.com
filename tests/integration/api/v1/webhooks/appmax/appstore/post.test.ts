import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import handler from "pages/api/v1/webhooks/appmax/[token]/appstore";
import { apiRequest } from "tests/fixtures/api_request";
import orchestrator from "tests/orchestrator";

const environment = { ...process.env };
const appId = "ef6ddb0d-3718-4b5e-88e5-69ac9d817903";
const siteId = "8e21db31-14ae-4583-86ca-2f2b0cf9190d";
const webhookToken = "synthetic-appstore-webhook-token-at-least-32";
const fixtureIds: string[] = [];

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

beforeEach(() => {
  process.env.VERCEL_ENV = "preview";
  process.env.PAYMENT_ENVIRONMENT = "sandbox";
  process.env.APPMAX_APPSTORE_APP_ID = appId;
  process.env.APPMAX_APPSTORE_WEBHOOK_TOKEN = webhookToken;
});

afterEach(() => {
  process.env = { ...environment };
});

afterAll(async () => {
  try {
    if (fixtureIds.length === 0) return;
    const orders = { in: fixtureIds };
    await prisma.$transaction([
      prisma.purchasePaymentJob.deleteMany({ where: { order_id: orders } }),
      prisma.purchasePaymentAttempt.deleteMany({ where: { order_id: orders } }),
      prisma.purchaseOrder.deleteMany({ where: { id: orders } }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
});

async function seedRemoteOrder(
  remoteOrderId: number,
  provider = "appmax",
  environmentName = "sandbox",
) {
  const scope = {
    payment_provider: provider,
    payment_environment: environmentName,
  };
  const order = await prisma.purchaseOrder.create({
    data: {
      ...scope,
      user_id: randomUUID(),
      idempotency_key: randomUUID(),
      item_type: "GAME",
      item_id: randomUUID(),
      product_name: "Synthetic webhook test item",
      amount_minor: 2500,
      currency: "BRL",
    },
  });
  fixtureIds.push(order.id);
  const attempt = await prisma.purchasePaymentAttempt.create({
    data: {
      ...scope,
      order_id: order.id,
      remote_order_id: String(remoteOrderId),
      idempotency_key: randomUUID(),
      method: "card",
      total_minor: 2500,
      quote_expires_at: new Date(0),
    },
  });
  return { order, attempt };
}

function appstoreWebhook(
  orderId: number,
  event = "order_approved",
  eventType = "order",
) {
  return {
    event,
    event_type: eventType,
    site_id: siteId,
    app_id: appId,
    data: { order_id: orderId, status: "approved", total: 1 },
    partner_merchant: {
      merchant_email: "fixture@example.test",
      merchant_document_number: "19100000000",
      merchant_phone: "11999999999",
    },
  };
}

function postWebhook(body: unknown, token = webhookToken) {
  return apiRequest(handler, {
    url: `/api/v1/webhooks/appmax/${token}/appstore`,
    query: { token },
    body,
  });
}

describe("POST /api/v1/webhooks/appmax/[token]/appstore", () => {
  test.each([
    [312341, "order_approved", "order"],
    [312342, "payment_not_authorized", "payment"],
  ])(
    "only enqueues reconciliation for the matching sandbox order %d on %s",
    async (id, event, eventType) => {
      const known = await seedRemoteOrder(id);
      const otherProvider = await seedRemoteOrder(id, "stripe");
      const otherEnvironment = await seedRemoteOrder(
        id,
        "appmax",
        "production",
      );
      const webhook = appstoreWebhook(id, event, eventType);

      for (const delivery of [webhook, webhook]) {
        const response = await postWebhook(delivery);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
      }

      const ids = [known, otherProvider, otherEnvironment].map(
        ({ order }) => order.id,
      );
      const orderIds = { in: ids };
      expect(
        await prisma.purchasePaymentJob.findMany({
          where: { order_id: orderIds },
          select: { order_id: true, attempts: true, last_error: true },
        }),
      ).toEqual([{ order_id: known.order.id, attempts: 0, last_error: null }]);
      expect(
        await prisma.purchasePaymentAttempt.findUniqueOrThrow({
          where: { id: known.attempt.id },
          select: { last_error: true, status: true, total_minor: true },
        }),
      ).toEqual({
        last_error: "RECONCILE_SIGNAL",
        status: "UNPAID",
        total_minor: 2500,
      });
      expect(
        await prisma.purchaseOrder.findUniqueOrThrow({
          where: { id: known.order.id },
          select: { payment_status: true, paid_at: true, amount_minor: true },
        }),
      ).toEqual({
        payment_status: "UNPAID",
        paid_at: null,
        amount_minor: 2500,
      });
      expect(
        await prisma.purchasePaymentEvent.count({
          where: { order_id: orderIds },
        }),
      ).toBe(0);
    },
  );

  test("rejects a wrong token, application or deployment before queuing any work", async () => {
    const id = 312343;
    const { order } = await seedRemoteOrder(id);
    const webhook = appstoreWebhook(id);
    const wrongToken = await postWebhook(
      webhook,
      "different-private-url-token",
    );
    const wrongApplication = await postWebhook({
      ...webhook,
      app_id: randomUUID(),
    });
    process.env.VERCEL_ENV = "production";
    const wrongEnvironment = await postWebhook(webhook);

    for (const result of [wrongToken, wrongApplication, wrongEnvironment]) {
      expect(result.status).toBe(404);
      expect(result.body).toEqual({
        message: "Not found.",
        name: "NotFoundError",
        action: "Check the webhook URL and application configuration.",
        status_code: 404,
      });
    }
    expect(
      await prisma.purchasePaymentJob.findUnique({
        where: { order_id: order.id },
      }),
    ).toBeNull();
  });

  test("redacts the private URL and omits the payload in error logs", async () => {
    process.env.PAYMENT_ENVIRONMENT = "production";
    const webhook = appstoreWebhook(312345);
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await postWebhook(webhook);
      expect(result.status).toBe(503);
      expect(result.body).toEqual({
        message: "Purchases are unavailable.",
        name: "ServiceError",
        action: "Check service availability",
        status_code: 503,
      });
      expect(errorLog).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(errorLog.mock.calls);
      expect(logged).toContain("/api/v1/webhooks/appmax/[redacted]/appstore");
      expect(logged).not.toContain(webhookToken);
      expect(logged).not.toContain(webhook.partner_merchant.merchant_email);
      expect(logged).not.toContain(
        webhook.partner_merchant.merchant_document_number,
      );
    } finally {
      errorLog.mockRestore();
    }
  });

  test("rejects malformed events and acknowledges unrelated events without changing an order", async () => {
    const id = 312344;
    const { order } = await seedRemoteOrder(id);
    const webhook = appstoreWebhook(id);
    const badPayloads = [
      { event: "OrderPaid", data: { id } },
      { ...webhook, data: { id } },
      { ...webhook, event_type: "payment" },
    ];
    for (const payload of badPayloads) {
      const result = await postWebhook(payload);
      expect(result.status).toBe(400);
      expect(result.body).toEqual({
        message: "Invalid payment notification.",
        name: "ValidationError",
        action: "Send an Appmax Appstore webhook with the documented fields.",
        status_code: 400,
      });
    }

    const unrelated = await postWebhook(
      appstoreWebhook(id, "customer_created", "customer"),
    );
    const unknown = await postWebhook(appstoreWebhook(1000000));
    for (const result of [unrelated, unknown]) {
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ received: true });
    }
    expect(
      await prisma.purchasePaymentJob.findUnique({
        where: { order_id: order.id },
      }),
    ).toBeNull();
  });
});
