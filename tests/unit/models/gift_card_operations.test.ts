import { prisma } from "infra/database";
import emailDelivery, {
  type GiftCardFulfillmentResult,
} from "models/gift_card_email_delivery";
import giftCardOperations from "models/gift_card_operations";
import paymentWorker from "models/purchase_payment_jobs";

jest.mock("infra/database", () => ({
  prisma: {
    giftCardFulfillmentJob: { count: jest.fn() },
    purchasePaymentJob: { count: jest.fn() },
  },
}));
jest.mock("infra/gift_card_provider", () => ({
  assertGiftCardSandbox: jest.fn(),
}));
jest.mock("models/gift_card_catalog", () => ({
  syncGiftCardCatalog: jest.fn(),
}));
jest.mock("models/gift_card_email_delivery", () => ({
  __esModule: true,
  default: { runOneDetailed: jest.fn() },
}));
jest.mock("models/purchase_payment_jobs", () => ({
  __esModule: true,
  default: { runOne: jest.fn() },
}));

const run = emailDelivery.runOneDetailed as jest.MockedFunction<
  typeof emailDelivery.runOneDetailed
>;
const noJob: GiftCardFulfillmentResult = {
  processed: false,
  error_code: null,
  provider_error: null,
};
const succeeded: GiftCardFulfillmentResult = {
  processed: true,
  error_code: null,
  provider_error: null,
};
const failed: GiftCardFulfillmentResult = {
  processed: true,
  error_code: "SUBMISSION_UNCERTAIN",
  provider_error: "VALIDATION_FAILED",
};

beforeEach(() => {
  jest.clearAllMocks();
  run.mockReset().mockResolvedValue(noJob);
  jest.mocked(paymentWorker.runOne).mockReset().mockResolvedValue(false);
  jest.mocked(prisma.giftCardFulfillmentJob.count).mockResolvedValue(0);
  jest.mocked(prisma.purchasePaymentJob.count).mockResolvedValue(0);
});

test("a captured provider failure is reported as failed rather than succeeded", async () => {
  run.mockResolvedValueOnce(failed);
  jest.mocked(prisma.giftCardFulfillmentJob.count).mockResolvedValue(1);
  expect(await giftCardOperations.submitPaidOrders()).toEqual({
    processed: 1,
    succeeded: 0,
    failed: 1,
    remaining: 1,
    last_error: "VALIDATION_FAILED",
  });
  expect(run).toHaveBeenNthCalledWith(1, "submit");
});

test("a mixed batch counts each processed outcome and stops on an empty queue", async () => {
  run
    .mockResolvedValueOnce(succeeded)
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(succeeded);
  jest.mocked(prisma.giftCardFulfillmentJob.count).mockResolvedValue(2);
  expect(await giftCardOperations.submitPaidOrders()).toEqual({
    processed: 3,
    succeeded: 2,
    failed: 1,
    remaining: 2,
    last_error: "VALIDATION_FAILED",
  });
  expect(run).toHaveBeenCalledTimes(4);
});

test("no job is not counted as either success or failure", async () => {
  expect(await giftCardOperations.submitPaidOrders()).toEqual({
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 0,
    last_error: null,
  });
  expect(run).toHaveBeenCalledTimes(1);
});

test("a captured failure without provider metadata retains the safe worker code", async () => {
  run.mockResolvedValueOnce({
    processed: true,
    error_code: "TRACKING_UNKNOWN",
    provider_error: null,
  });
  expect(await giftCardOperations.trackDeliveries()).toMatchObject({
    processed: 1,
    succeeded: 0,
    failed: 1,
    last_error: "TRACKING_UNKNOWN",
  });
});

test("targeted tracking reports a captured failure and invokes the worker only once", async () => {
  const options = { order_id: "synthetic-order", force: true };
  run.mockResolvedValue({
    processed: true,
    error_code: "TRACKING_UNAVAILABLE",
    provider_error: "TRACKING_NOT_FOUND",
  });
  expect(await giftCardOperations.trackDeliveries(options)).toMatchObject({
    processed: 1,
    succeeded: 0,
    failed: 1,
    last_error: "TRACKING_NOT_FOUND",
  });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledWith("track", options);
});

test("payment reconciliation retains its existing boolean worker behavior", async () => {
  jest.mocked(paymentWorker.runOne).mockResolvedValueOnce(true);
  expect(await giftCardOperations.reconcilePayments()).toEqual({
    processed: 1,
    succeeded: 1,
    failed: 0,
    remaining: 0,
    last_error: null,
  });
  expect(paymentWorker.runOne).toHaveBeenCalledTimes(2);
  expect(run).not.toHaveBeenCalled();
});

test("an uncaught worker error is reduced to a fixed operation error", async () => {
  run.mockRejectedValueOnce(
    new Error("synthetic-private-recipient@example.test"),
  );
  expect(await giftCardOperations.submitPaidOrders()).toEqual({
    processed: 0,
    succeeded: 0,
    failed: 1,
    remaining: 0,
    last_error: "OPERATION_UNAVAILABLE",
  });
});

test("a batch still stops after five processed jobs", async () => {
  run.mockResolvedValue(succeeded);
  expect(await giftCardOperations.submitPaidOrders()).toMatchObject({
    processed: 5,
    succeeded: 5,
    failed: 0,
  });
  expect(run).toHaveBeenCalledTimes(5);
});
