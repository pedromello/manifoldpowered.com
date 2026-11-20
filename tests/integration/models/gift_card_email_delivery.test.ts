import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { encryptGiftRecipient } from "infra/gift_card_recipient";
import {
  GiftCardApiError,
  type EmailGiftProvider,
  type EmailGiftTracking,
} from "infra/gift_card_api";
import {
  createEmailGiftDelivery,
  enqueueGiftFulfillment,
} from "models/gift_card_email_delivery";

// Synthetic provider, real PostgreSQL claims/transactions. This suite creates
// only its own orders and never calls a payment, email, or gift-card API.
const ids: string[] = [];
const originalEnvironment = { ...process.env };
const SIX_HOURS = 6 * 60 * 60 * 1000;
let errorLog: jest.SpyInstance;

function pending(id: string): EmailGiftTracking {
  return {
    status: "pending",
    reference: `synthetic:${id}`,
    provider_status: 1,
  };
}
function delivered(id: string): EmailGiftTracking {
  return {
    status: "delivered",
    reference: `synthetic:${id}`,
    provider_status: 3,
  };
}
function fixtureProvider() {
  const provider = {
    products: jest.fn<ReturnType<EmailGiftProvider["products"]>, []>(),
    submit: jest
      .fn<
        ReturnType<EmailGiftProvider["submit"]>,
        Parameters<EmailGiftProvider["submit"]>
      >()
      .mockImplementation(async ({ request_id }) => pending(request_id)),
    track: jest
      .fn<
        ReturnType<EmailGiftProvider["track"]>,
        Parameters<EmailGiftProvider["track"]>
      >()
      .mockImplementation(async (id) => pending(id)),
  };
  return {
    provider,
    service: createEmailGiftDelivery({ getProvider: () => provider }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function order() {
  const id = randomUUID(),
    buyer = randomUUID(),
    key = randomUUID(),
    code = `synthetic-${id}`,
    paid = new Date();
  ids.push(id);
  await prisma.$transaction(async (tx) => {
    await tx.giftCardOrder.create({
      data: {
        id,
        user_id: buyer,
        idempotency_key: key,
        product_code: code,
        product_name: "Synthetic email gift card",
        amount_minor: 2500,
        currency: "BRL",
        status: "PAID",
        paid_at: paid,
        delivery_channel: "EMAIL",
        provider_environment: "sandbox",
        provider_sku: "synthetic-sku",
        recipient_email: `${buyer}@example.test`,
        recipient_confirmed_at: new Date(),
        recipient_data: encryptGiftRecipient(
          { name: "Synthetic Buyer", document: "19100000000" },
          id,
        ),
      },
    });
    await tx.purchaseOrder.create({
      data: {
        id,
        user_id: buyer,
        idempotency_key: key,
        item_type: "GIFT_CARD",
        item_id: code,
        product_name: "Synthetic email gift card",
        amount_minor: 2500,
        currency: "BRL",
        gift_card_order_id: id,
        payment_provider: "stripe",
        payment_environment: "sandbox",
        payment_status: "PAID",
        paid_at: paid,
      },
    });
    await enqueueGiftFulfillment(id, tx);
  });
  return id;
}
async function makeDue(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.giftCardOrder.update({
      where: { id },
      data: { next_tracking_at: new Date(0) },
    });
    await tx.giftCardFulfillmentJob.update({
      where: { order_id: id },
      data: { run_after: new Date(0) },
    });
  });
}
async function financialReversal(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: { payment_status: "REFUNDED", delivery_status: "REVIEW" },
    });
    await tx.giftCardOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });
}
async function gift(id: string) {
  return prisma.giftCardOrder.findUniqueOrThrow({ where: { id } });
}
async function purchase(id: string) {
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
}
async function entitlementCount(id: string) {
  return prisma.libraryItem.count({
    where: { item_id: id, item_type: "GIFT_CARD" },
  });
}

beforeEach(() => {
  process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY = "11".repeat(32);
  process.env.PAYMENT_ENVIRONMENT = "sandbox";
  errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => errorLog.mockRestore());
afterAll(async () => {
  const where = { order_id: { in: ids } };
  await prisma.giftCardFulfillmentJob.deleteMany({ where });
  await prisma.libraryItem.deleteMany({ where: { item_id: { in: ids } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: ids } } });
  await prisma.giftCardOrder.deleteMany({ where: { id: { in: ids } } });
  process.env = originalEnvironment;
  await prisma.$disconnect();
});

test("accepted submission stays processing with a six-hour tracking reservation", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider(),
    before = Date.now();
  expect(await service.runOne("submit", { order_id: id })).toBe(true);
  const persisted = await gift(id);
  expect(persisted).toMatchObject({
    status: "PAID",
    fulfillment_status: "PROCESSING",
    submitted_at: expect.any(Date),
    provider_reference: `synthetic:${id}`,
    gift_card_code: null,
    fulfilled_at: null,
  });
  expect(persisted.next_tracking_at!.getTime()).toBeGreaterThanOrEqual(
    before + SIX_HOURS,
  );
  expect(await purchase(id)).toMatchObject({
    payment_status: "PAID",
    delivery_status: "PENDING",
  });
  expect(await entitlementCount(id)).toBe(0);
  expect(await service.runOne("submit", { order_id: id })).toBe(false);
  expect(await service.runOne("track", { order_id: id })).toBe(false);
  expect(provider.submit).toHaveBeenCalledTimes(1);
  expect(provider.track).not.toHaveBeenCalled();
});

test("detailed results expose captured failures while the boolean worker remains compatible", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider(),
    before = Date.now();
  provider.submit.mockRejectedValueOnce(
    new GiftCardApiError("AUTHENTICATION_FAILED", 0, { http_status: 401 }),
  );
  expect(await service.runOneDetailed("submit", { order_id: id })).toEqual({
    processed: true,
    error_code: "SUBMISSION_UNCERTAIN",
    provider_error: "AUTHENTICATION_FAILED",
  });
  const submitted = await gift(id);
  expect(submitted).toMatchObject({
    status: "PAID",
    fulfillment_status: "PROCESSING",
    issuance_started_at: expect.any(Date),
    submitted_at: expect.any(Date),
    last_error: "SUBMISSION_UNCERTAIN",
  });
  expect(submitted.next_tracking_at!.getTime()).toBeGreaterThanOrEqual(
    before + SIX_HOURS,
  );
  expect(await service.runOne("submit", { order_id: id })).toBe(false);
  await makeDue(id);
  provider.track.mockRejectedValueOnce(
    new GiftCardApiError("PROVIDER_UNAVAILABLE", 0, { http_status: 503 }),
  );
  expect(await service.runOne("track", { order_id: id })).toBe(true);
  expect(await gift(id)).toMatchObject({
    status: "PAID",
    last_error: "TRACKING_UNAVAILABLE",
  });
  expect(provider.submit).toHaveBeenCalledTimes(1);
  expect(provider.track).toHaveBeenCalledTimes(1);
});

test("a reconciling submit claim reports the actual tracking failure without another POST", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  await prisma.giftCardOrder.update({
    where: { id },
    data: { issuance_started_at: new Date() },
  });
  provider.track.mockRejectedValueOnce(
    new GiftCardApiError("RATE_LIMITED", 1000, { http_status: 429 }),
  );
  expect(await service.runOneDetailed("submit", { order_id: id })).toEqual({
    processed: true,
    error_code: "TRACKING_UNAVAILABLE",
    provider_error: "RATE_LIMITED",
  });
  expect(provider.submit).not.toHaveBeenCalled();
  expect(provider.track).toHaveBeenCalledWith(id);
  expect(await gift(id)).toMatchObject({
    status: "PAID",
    last_error: "TRACKING_UNAVAILABLE",
    submitted_at: expect.any(Date),
  });
  expect(JSON.parse(errorLog.mock.calls[0][0])).toEqual({
    event: "gift_card_fulfillment_failed",
    phase: "track",
    category: "RATE_LIMITED",
    http_status: 429,
    invalid_fields: [],
  });
});

test("failure logs retain only allowlisted diagnostics without identity or request details", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  const error = new GiftCardApiError("VALIDATION_FAILED", 0, {
    http_status: 400,
    invalid_fields: ["document", "email"],
  });
  Object.assign(error, {
    message: "synthetic-private-recipient@example.test",
    cause: new Error("https://private.example.test/synthetic-private-token"),
    response: { body: "synthetic-private-document" },
    invalid_fields: [
      "document",
      "email",
      "document",
      "synthetic-private-field",
    ],
  });
  provider.submit.mockRejectedValueOnce(error);
  expect(await service.runOneDetailed("submit", { order_id: id })).toEqual({
    processed: true,
    error_code: "SUBMISSION_UNCERTAIN",
    provider_error: "VALIDATION_FAILED",
  });
  expect(errorLog).toHaveBeenCalledTimes(1);
  expect(JSON.parse(errorLog.mock.calls[0][0])).toEqual({
    event: "gift_card_fulfillment_failed",
    phase: "submit",
    category: "VALIDATION_FAILED",
    http_status: 400,
    invalid_fields: ["document", "email"],
  });
  const logged = JSON.stringify(errorLog.mock.calls);
  expect(logged).not.toContain(id);
  expect(logged).not.toContain("synthetic-private");
  expect(logged).not.toContain("cause");
  expect(logged).not.toContain("body");
});

test.each([
  new Error("synthetic-private-error@example.test"),
  new GiftCardApiError("synthetic-private-category"),
])(
  "unknown failures use a fixed category and preserve a safe worker result",
  async (error) => {
    const id = await order(),
      { provider, service } = fixtureProvider();
    provider.submit.mockRejectedValueOnce(error);
    expect(await service.runOneDetailed("submit", { order_id: id })).toEqual({
      processed: true,
      error_code: "SUBMISSION_UNCERTAIN",
      provider_error: null,
    });
    expect(JSON.parse(errorLog.mock.calls[0][0])).toEqual({
      event: "gift_card_fulfillment_failed",
      phase: "submit",
      category: "UNEXPECTED_ERROR",
      http_status: null,
      invalid_fields: [],
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
      "synthetic-private",
    );
  },
);

test("detailed results distinguish an empty queue from an unknown tracking response", async () => {
  const { provider, service } = fixtureProvider();
  expect(
    await service.runOneDetailed("submit", { order_id: randomUUID() }),
  ).toEqual({ processed: false, error_code: null, provider_error: null });
  expect(errorLog).not.toHaveBeenCalled();
  const id = await order();
  await service.runOne("submit", { order_id: id });
  await makeDue(id);
  provider.track.mockResolvedValueOnce({
    status: "unknown",
    reference: null,
    provider_status: null,
  });
  expect(await service.runOneDetailed("track", { order_id: id })).toEqual({
    processed: true,
    error_code: "TRACKING_UNKNOWN",
    provider_error: null,
  });
  expect(await gift(id)).toMatchObject({
    status: "PAID",
    last_error: "TRACKING_UNKNOWN",
  });
  expect(provider.submit).toHaveBeenCalledTimes(1);
});

test("tracking status 3 completes once without storing or revealing a code", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  await service.runOne("submit", { order_id: id });
  await makeDue(id);
  provider.track.mockResolvedValue(delivered(id));
  expect(await service.runOne("track", { order_id: id })).toBe(true);
  expect(await gift(id)).toMatchObject({
    status: "FULFILLED",
    fulfillment_status: "DELIVERED",
    provider_status: 3,
    gift_card_code: null,
    first_revealed_at: null,
    fulfilled_at: expect.any(Date),
    next_tracking_at: null,
  });
  expect(await purchase(id)).toMatchObject({
    payment_status: "PAID",
    delivery_status: "READY",
    fulfilled_at: expect.any(Date),
  });
  expect(await entitlementCount(id)).toBe(1);
  expect(
    await prisma.giftCardFulfillmentJob.findUnique({ where: { order_id: id } }),
  ).toBeNull();
  expect(await service.runOne("track", { order_id: id, force: true })).toBe(
    false,
  );
  expect(provider.track).toHaveBeenCalledTimes(1);
});

test("tracking preserves the first accepted reference when responses use another reference", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  provider.submit.mockResolvedValue({
    ...pending(id),
    reference: "synthetic-submission-reference",
  });
  await service.runOne("submit", { order_id: id });
  await makeDue(id);
  provider.track.mockResolvedValue({
    ...pending(id),
    reference: "synthetic-tracking-reference",
  });
  expect(await service.runOne("track", { order_id: id })).toBe(true);
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "PROCESSING",
    provider_reference: "synthetic-submission-reference",
  });
  await makeDue(id);
  provider.track.mockResolvedValue({
    ...delivered(id),
    reference: "synthetic-tracking-reference",
  });
  expect(await service.runOne("track", { order_id: id })).toBe(true);
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "DELIVERED",
    provider_reference: "synthetic-submission-reference",
    provider_status: 3,
  });
  expect(provider.submit).toHaveBeenCalledTimes(1);
  expect(provider.track).toHaveBeenCalledTimes(2);
});

test("tracking status 7 stops processing while preserving confirmed payment for review", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  await service.runOne("submit", { order_id: id });
  await makeDue(id);
  provider.track.mockResolvedValue({
    status: "cancelled",
    reference: `synthetic:${id}`,
    provider_status: 7,
  });
  await service.runOne("track", { order_id: id });
  expect(await gift(id)).toMatchObject({
    status: "ISSUANCE_FAILED",
    fulfillment_status: "CANCELLED",
    provider_status: 7,
    paid_at: expect.any(Date),
    gift_card_code: null,
  });
  expect(await purchase(id)).toMatchObject({
    payment_status: "PAID",
    paid_at: expect.any(Date),
    delivery_status: "REVIEW",
  });
  expect(await entitlementCount(id)).toBe(0);
  expect(await service.runOne("track", { order_id: id, force: true })).toBe(
    false,
  );
});

test("a lost submission response is reconciled after restart without another POST", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  provider.submit.mockRejectedValueOnce(
    new Error("synthetic response lost after acceptance"),
  );
  await service.runOne("submit", { order_id: id });
  expect(await gift(id)).toMatchObject({
    issuance_started_at: expect.any(Date),
    submitted_at: expect.any(Date),
    provider_reference: null,
    last_error: "SUBMISSION_UNCERTAIN",
  });
  await makeDue(id);
  delete process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  provider.track.mockResolvedValue(delivered(id));
  const restarted = createEmailGiftDelivery({ getProvider: () => provider });
  await restarted.runOne("track", { order_id: id });
  expect(provider.submit).toHaveBeenCalledTimes(1);
  expect(provider.track).toHaveBeenCalledWith(id);
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "DELIVERED",
    provider_reference: `synthetic:${id}`,
    gift_card_code: null,
  });
});

test("an expired old claimant cannot complete over a restarted worker", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider(),
    started = deferred<void>(),
    response = deferred<EmailGiftTracking>();
  provider.submit.mockImplementationOnce(() => {
    started.resolve();
    return response.promise;
  });
  const stale = service.runOne("submit", { order_id: id });
  await started.promise;
  expect(await service.runOne("submit", { order_id: id })).toBe(false);
  await prisma.giftCardFulfillmentJob.update({
    where: { order_id: id },
    data: { claim_until: new Date(0) },
  });
  delete process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  const restarted = createEmailGiftDelivery({ getProvider: () => provider });
  expect(await restarted.runOne("submit", { order_id: id })).toBe(true);
  response.resolve(delivered(id));
  await stale;
  expect(provider.submit).toHaveBeenCalledTimes(1);
  expect(provider.track).toHaveBeenCalledTimes(1);
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "PROCESSING",
    gift_card_code: null,
    fulfilled_at: null,
  });
  expect(await entitlementCount(id)).toBe(0);
  await makeDue(id);
  provider.track.mockResolvedValue(delivered(id));
  await restarted.runOne("track", { order_id: id });
  expect(await entitlementCount(id)).toBe(1);
});

test("forced homologation tracking cannot bypass its one-minute cooldown", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  await service.runOne("submit", { order_id: id });
  expect(await service.runOne("track", { order_id: id, force: true })).toBe(
    true,
  );
  expect(await service.runOne("track", { order_id: id, force: true })).toBe(
    false,
  );
  await prisma.giftCardOrder.update({
    where: { id },
    data: { last_tracking_at: new Date(Date.now() - 61000) },
  });
  expect(await service.runOne("track", { order_id: id, force: true })).toBe(
    true,
  );
  expect(provider.track).toHaveBeenCalledTimes(2);
  expect(provider.submit).toHaveBeenCalledTimes(1);
});

test("refund before initial submission prevents any external order", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  await financialReversal(id);
  expect(await service.runOne("submit", { order_id: id })).toBe(false);
  expect(provider.submit).not.toHaveBeenCalled();
  expect(provider.track).not.toHaveBeenCalled();
  expect(await gift(id)).toMatchObject({
    issuance_started_at: null,
    submitted_at: null,
  });
  expect(await entitlementCount(id)).toBe(0);
});

test("refund during submission preserves tracking and never grants entitlement", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider(),
    started = deferred<void>(),
    response = deferred<EmailGiftTracking>();
  provider.submit.mockImplementationOnce(() => {
    started.resolve();
    return response.promise;
  });
  const inflight = service.runOne("submit", { order_id: id });
  await started.promise;
  await financialReversal(id);
  response.resolve(pending(id));
  await inflight;
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "REVIEW",
    submitted_at: expect.any(Date),
    next_tracking_at: expect.any(Date),
  });
  await makeDue(id);
  provider.track.mockResolvedValue(delivered(id));
  expect(await service.runOne("track", { order_id: id })).toBe(true);
  expect(await purchase(id)).toMatchObject({
    payment_status: "REFUNDED",
    delivery_status: "REVIEW",
    paid_at: expect.any(Date),
  });
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "DELIVERED",
    provider_status: 3,
  });
  expect(await entitlementCount(id)).toBe(0);
  expect(provider.submit).toHaveBeenCalledTimes(1);
});

test("encryption key loss before initial submission cannot leave an issuance marker", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  delete process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  expect(await service.runOneDetailed("submit", { order_id: id })).toEqual({
    processed: true,
    error_code: "RECIPIENT_REVIEW",
    provider_error: null,
  });
  expect(await gift(id)).toMatchObject({
    fulfillment_status: "REVIEW",
    last_error: "RECIPIENT_REVIEW",
    issuance_started_at: null,
    submitted_at: null,
  });
  expect(provider.submit).not.toHaveBeenCalled();
  expect(provider.track).not.toHaveBeenCalled();
});

test("tracking an accepted order remains possible after the encryption key becomes unavailable", async () => {
  const id = await order(),
    { provider, service } = fixtureProvider();
  await service.runOne("submit", { order_id: id });
  await makeDue(id);
  delete process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  provider.track.mockResolvedValue(delivered(id));
  expect(await service.runOne("track", { order_id: id })).toBe(true);
  expect(await gift(id)).toMatchObject({ fulfillment_status: "DELIVERED" });
  expect(provider.submit).toHaveBeenCalledTimes(1);
});
