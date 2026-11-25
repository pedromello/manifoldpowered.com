import type { NextApiRequest, NextApiResponse } from "next";
import adminHandler from "pages/api/v1/backoffice/gift-cards/[action]";
import summaryHandler from "pages/api/v1/backoffice/gift-cards";
import productHandler from "pages/api/v1/backoffice/gift-cards/products";
import cronHandler from "pages/api/v1/cron/gift-cards/[action]";
import operations from "models/gift_card_operations";
import auditLog from "models/audit_log";
import { ConflictError } from "infra/errors";

jest.mock("models/gift_card_operations", () => ({
  __esModule: true,
  default: {
    summary: jest.fn(),
    syncCatalog: jest.fn(),
    reconcilePayments: jest.fn(),
    submitPaidOrders: jest.fn(),
    trackDeliveries: jest.fn(),
    setProductEnabled: jest.fn(),
  },
}));
jest.mock("models/audit_log", () => ({
  __esModule: true,
  default: { record: jest.fn() },
}));
jest.mock("infra/database", () => ({ prisma: {} }));
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

const original = { ...process.env };
const report = {
  processed: 1,
  succeeded: 1,
  failed: 0,
  remaining: 2,
  last_error: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...original, PAYMENT_ENVIRONMENT: "sandbox" };
  (operations.syncCatalog as jest.Mock).mockResolvedValue({
    ...report,
    raw: "private-fixture",
  });
  (operations.reconcilePayments as jest.Mock).mockResolvedValue(report);
  (operations.submitPaidOrders as jest.Mock).mockResolvedValue(report);
  (operations.trackDeliveries as jest.Mock).mockResolvedValue(report);
});
afterEach(() => {
  process.env = { ...original };
});

async function call(
  handler = adminHandler,
  {
    action = "sync-catalog",
    body = {},
    method = "POST",
    user = "admin",
    origin = "https://hml.example.test",
    contentType = "application/json",
    authorization,
  }: {
    action?: string;
    body?: unknown;
    method?: string;
    user?: string;
    origin?: string;
    contentType?: string;
    authorization?: string;
  } = {},
) {
  const req = {
    method,
    body,
    query: { action },
    url: "/api/v1/backoffice/gift-cards",
    headers: {
      host: "hml.example.test",
      origin,
      "content-type": contentType,
      authorization,
    },
    context: {
      user:
        user === "anonymous"
          ? { features: [] }
          : {
              id: user,
              features:
                user === "admin"
                  ? ["read:gift_card:any", "update:gift_card:any"]
                  : ["read:library"],
            },
    },
  } as unknown as NextApiRequest;
  const responseHeaders: Record<string, string | string[]> = {};
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn((key: string, value: string | string[]) => {
      responseHeaders[key.toLowerCase()] = value;
    }),
    getHeader: jest.fn((key: string) => responseHeaders[key.toLowerCase()]),
    end: jest.fn().mockReturnThis(),
  };
  await handler(req, res as unknown as NextApiResponse);
  return res;
}

test.each([
  ["anonymous", 401],
  ["buyer", 403],
])("%s cannot execute gift card operations", async (user, status) => {
  const response = await call(adminHandler, { user: String(user) });
  expect(response.status).toHaveBeenCalledWith(status);
  expect(operations.syncCatalog).not.toHaveBeenCalled();
});

test.each([
  { origin: "https://foreign.example.test" },
  { origin: "null" },
  { origin: undefined },
  { contentType: "text/plain" },
])(
  "blocks cross-origin or non-JSON administrative requests: %j",
  async (headers) => {
    // Explicit undefined is removed below because call() defaults omitted values.
    const response = await call(adminHandler, {
      ...headers,
      origin:
        headers.origin === undefined && !("contentType" in headers)
          ? ""
          : headers.origin,
    });
    expect(response.status).toHaveBeenCalledWith(403);
    expect(operations.syncCatalog).not.toHaveBeenCalled();
  },
);

test("rejects extra body fields without executing the operation", async () => {
  const response = await call(adminHandler, { body: { price: 1 } });
  expect(response.status).toHaveBeenCalledWith(400);
  expect(operations.syncCatalog).not.toHaveBeenCalled();
});

test("runs the shared operation and audits only the projected report", async () => {
  const response = await call();
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith(report);
  expect(auditLog.record).toHaveBeenCalledWith(
    expect.objectContaining({
      admin_user_id: "admin",
      action: "gift_card:sync-catalog",
      metadata: report,
    }),
  );
  expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
});

test("payment reconciliation executes the payment runner", async () => {
  await call(adminHandler, { action: "reconcile-payments" });
  expect(operations.reconcilePayments).toHaveBeenCalledTimes(1);
});

const submitAction = "submit-paid-orders";
const targetOrderId = "7a330000-0000-4000-8000-000000000001";

test("a scoped submission sends the requested ID and projects an order-scoped audit", async () => {
  jest.mocked(operations.submitPaidOrders).mockResolvedValue({
    ...report,
    remaining: 0,
  });
  const response = await call(adminHandler, {
    action: submitAction,
    body: { order_id: targetOrderId },
  });
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith({ ...report, remaining: 0 });
  expect(operations.submitPaidOrders).toHaveBeenCalledTimes(1);
  expect(operations.submitPaidOrders).toHaveBeenCalledWith(targetOrderId);
  expect(auditLog.record).toHaveBeenCalledWith({
    admin_user_id: "admin",
    action: "gift_card:submit-paid-orders",
    target_type: "gift_card_order",
    target_id: targetOrderId,
    metadata: { ...report, remaining: 0 },
  });
});

test.each([
  { user: "anonymous", body: { order_id: targetOrderId }, status: 401 },
  { user: "buyer", body: { order_id: targetOrderId }, status: 403 },
  { user: "admin", body: { order_id: "invalid" }, status: 400 },
  {
    user: "admin",
    body: { order_id: targetOrderId, force: true },
    status: 400,
  },
])(
  "rejects a prohibited or invalid scoped submission (%j)",
  async ({ user, body, status }) => {
    const response = await call(adminHandler, {
      action: submitAction,
      user,
      body,
    });
    expect(response.status).toHaveBeenCalledWith(status);
    expect(operations.submitPaidOrders).not.toHaveBeenCalled();
  },
);

test("an empty submission body still runs the batch", async () => {
  const response = await call(adminHandler, { action: submitAction });
  expect(response.status).toHaveBeenCalledWith(200);
  expect(operations.submitPaidOrders).toHaveBeenCalledWith(undefined);
});

test("an unavailable scoped submission returns a conflict and audits the selected order", async () => {
  const message = "Sending is unavailable for this order.";
  jest
    .mocked(operations.submitPaidOrders)
    .mockRejectedValue(new ConflictError({ message }));
  const response = await call(adminHandler, {
    action: submitAction,
    body: { order_id: targetOrderId },
  });
  expect(response.status).toHaveBeenCalledWith(409);
  const [payload] = response.json.mock.calls[0];
  expect(JSON.parse(JSON.stringify(payload))).toEqual({
    message,
    name: "ConflictError",
    action: "Refresh the resource and try again",
    status_code: 409,
  });
  expect(auditLog.record).toHaveBeenCalledWith({
    admin_user_id: "admin",
    action: "gift_card:submit-paid-orders",
    target_type: "gift_card_order",
    target_id: targetOrderId,
    metadata: { failed: true },
  });
});

test("forced tracking requires a valid local order ID", async () => {
  const rejected = await call(adminHandler, {
    action: "track-deliveries",
    body: { force: true },
  });
  expect(rejected.status).toHaveBeenCalledWith(400);
  expect(operations.trackDeliveries).not.toHaveBeenCalled();
  const order_id = "7a330000-0000-4000-8000-000000000001";
  await call(adminHandler, {
    action: "track-deliveries",
    body: { force: true, order_id },
  });
  expect(operations.trackDeliveries).toHaveBeenCalledWith({
    force: true,
    order_id,
  });
});

test("product publication accepts only code and enabled state", async () => {
  const response = await call(productHandler, {
    body: { code: "synthetic-product", enabled: true, price: 1 },
  });
  expect(response.status).toHaveBeenCalledWith(400);
  expect(operations.setProductEnabled).not.toHaveBeenCalled();
  const accepted = await call(productHandler, {
    body: { code: "synthetic-product", enabled: true },
  });
  expect(accepted.status).toHaveBeenCalledWith(200);
  expect(operations.setProductEnabled).toHaveBeenCalledWith(
    "synthetic-product",
    true,
  );
});

test("summary rejects a buyer even when its page is hidden client-side", async () => {
  const response = await call(summaryHandler, { method: "GET", user: "buyer" });
  expect(response.status).toHaveBeenCalledWith(403);
  expect(operations.summary).not.toHaveBeenCalled();
});

test("cron fails closed without a configured matching secret", async () => {
  delete process.env.CRON_SECRET;
  expect(
    (await call(cronHandler, { method: "GET" })).status,
  ).toHaveBeenCalledWith(403);
  process.env.CRON_SECRET = "synthetic-cron-secret-at-least-32-characters";
  expect(
    (await call(cronHandler, { method: "GET", authorization: "Bearer wrong" }))
      .status,
  ).toHaveBeenCalledWith(403);
  expect(operations.syncCatalog).not.toHaveBeenCalled();
  const accepted = await call(cronHandler, {
    method: "GET",
    authorization: `Bearer ${process.env.CRON_SECRET}`,
  });
  expect(accepted.status).toHaveBeenCalledWith(200);
  expect(operations.syncCatalog).toHaveBeenCalledTimes(1);
});
