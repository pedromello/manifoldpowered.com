import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "infra/database";
import { encryptGiftRecipient } from "infra/gift_card_recipient";
import type { PaymentProvider } from "infra/payments/types";
import { createPurchaseOrderService } from "models/purchase_order";
import recipientHandler from "pages/api/v1/orders/[id]/recipient";

jest.mock("infra/database", () => ({
  prisma: {
    $transaction: jest.fn(),
    purchaseOrder: { findFirst: jest.fn() },
    purchasePaymentAttempt: { findFirst: jest.fn() },
    giftCardOrder: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userEmailVerification: { findUnique: jest.fn() },
  },
}));
jest.mock("infra/controller", () => {
  const actual = jest.requireActual("infra/controller").default;
  return {
    __esModule: true,
    default: {
      ...actual,
      injectAnonymousOrUser: async (
        _req: unknown,
        _res: unknown,
        next: () => Promise<void>,
      ) => next(),
    },
  };
});

const original = { ...process.env };
const email = "verified@example.test";
const order = {
  id: "53330000-0000-4000-8000-000000000001",
  user_id: "synthetic-buyer",
  gift_card_order_id: "53330000-0000-4000-8000-000000000002",
  payment_provider: "stripe",
  payment_environment: "sandbox",
  payment_status: "UNPAID",
  paid_at: null,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
};
const provider = {
  configured: jest.fn(() => true),
  capabilities: { hosted: true, methods: ["card"], installments: false },
  createCustomer: jest.fn(),
  createOrder: jest.fn(),
  pay: jest.fn(),
};
const tx = {
  $queryRaw: jest.fn(),
  purchaseOrder: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
  purchasePaymentAttempt: { findFirst: jest.fn(), update: jest.fn() },
  giftCardOrder: { findUniqueOrThrow: jest.fn() },
  userEmailVerification: { findUnique: jest.fn() },
};
const service = createPurchaseOrderService({
  getProvider: () => provider as unknown as PaymentProvider,
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, {
    PAYMENT_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER: "api",
    GIFT_CARD_PROVIDER_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_BASE_URL: "https://supplier.example.test",
    GIFT_CARD_PROVIDER_USERNAME: "synthetic-user",
    GIFT_CARD_PROVIDER_PASSWORD: "synthetic-password",
    GIFT_CARD_PROVIDER_API_TOKEN: "synthetic-token",
    GIFT_CARD_PROVIDER_TOKEN_SOURCE: "configured",
    GIFT_CARD_PROVIDER_CONTRACT_VERIFIED: "true",
    GIFT_CARD_PROVIDER_RESPONSE_MAPPING: JSON.stringify({
      products_path: "items",
      sku: "id",
      name: "label",
      face_value: "credit",
      fixed_currency: "BRL",
      value_unit: "major",
      reference: "reference",
      status: "state",
    }),
    GIFT_CARD_RECIPIENT_ENCRYPTION_KEY: "a".repeat(64),
  });
  delete process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED;
  const gift = {
    id: order.gift_card_order_id,
    delivery_channel: "EMAIL",
    recipient_email: email,
    recipient_confirmed_at: new Date(),
    recipient_data: encryptGiftRecipient(
      { name: "Synthetic Recipient" },
      order.gift_card_order_id,
    ),
  };
  jest.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(order as never);
  jest.mocked(prisma.purchasePaymentAttempt.findFirst).mockResolvedValue(null);
  jest.mocked(prisma.giftCardOrder.findUnique).mockResolvedValue(gift as never);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ email } as never);
  jest
    .mocked(prisma.userEmailVerification.findUnique)
    .mockResolvedValue({ email } as never);
  (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
    callback(tx),
  );
  tx.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([{ id: order.id }])
    .mockResolvedValueOnce([{ id: order.user_id, email }]);
  tx.purchaseOrder.findUniqueOrThrow.mockResolvedValue(order);
  tx.purchasePaymentAttempt.findFirst.mockResolvedValue({
    id: "synthetic-attempt",
    submission_started_at: null,
    uncertain: false,
  });
  tx.giftCardOrder.findUniqueOrThrow.mockResolvedValue(gift);
  tx.userEmailVerification.findUnique.mockResolvedValue({ email });
  jest
    .spyOn(global, "fetch")
    .mockRejectedValue(new Error("Unexpected HTTP request in unit test."));
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...original };
});

test("a previously confirmed recipient without a document cannot start payment by default", async () => {
  await expect(
    service.submit(order.user_id, order.id, {
      attempt_id: "synthetic-attempt",
      expected_total_minor: 2500,
      buyer: { email } as never,
    }),
  ).rejects.toMatchObject({
    statusCode: 409,
    message: "Please confirm the required recipient document before payment.",
  });
  expect(tx.purchasePaymentAttempt.update).not.toHaveBeenCalled();
  expect(tx.purchaseOrder.update).not.toHaveBeenCalled();
  expect(provider.createCustomer).not.toHaveBeenCalled();
  expect(provider.createOrder).not.toHaveBeenCalled();
  expect(provider.pay).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test("checkout requires a new recipient confirmation when the saved document is absent", async () => {
  expect(
    (await service.view(order.user_id, order.id)).gift_card_delivery,
  ).toEqual(
    expect.objectContaining({
      confirmed: true,
      document_required: true,
      recipient_ready: false,
      verification_required: false,
    }),
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("an explicit provider opt-out keeps a document-free recipient ready", async () => {
  process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED = "false";
  expect(
    (await service.view(order.user_id, order.id)).gift_card_delivery,
  ).toEqual(
    expect.objectContaining({
      document_required: false,
      recipient_ready: true,
    }),
  );
});

test("recipient confirmation rejects a missing document before reading or saving an order", async () => {
  const req = {
    method: "POST",
    url: `/api/v1/orders/${order.id}/recipient`,
    headers: {},
    query: { id: order.id },
    body: { name: "Synthetic Recipient", confirmed: true },
    context: { user: { id: order.user_id, features: ["create:library"] } },
  } as unknown as NextApiRequest;
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  await recipientHandler(req, res as unknown as NextApiResponse);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(prisma.purchaseOrder.findFirst).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
