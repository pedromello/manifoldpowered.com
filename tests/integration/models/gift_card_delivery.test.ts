import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { createGiftCardOrderService } from "models/gift_card_order";
import { createGiftCardDeliveryService } from "models/gift_card_delivery";
import {
  checkoutFixture,
  paymentEvent,
} from "tests/fixtures/gift_card_checkout";

let buyer: string;
let fixture: ReturnType<typeof checkoutFixture>;
let payments: ReturnType<typeof createGiftCardOrderService>;
const buyers: string[] = [];
beforeEach(() => {
  buyer = randomUUID();
  buyers.push(buyer);
  fixture = checkoutFixture();
  payments = createGiftCardOrderService(fixture);
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
  await prisma.$disconnect();
});
async function paidOrder() {
  const order = await payments.begin(buyer, "sandbox-brl-25", randomUUID());
  const event = paymentEvent(fixture.pay(order.id));
  await payments.receive(event);
  return { order, event };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a supplier taking 31 seconds holds no financial transaction or order lock", async () => {
  const { order, event } = await paidOrder();
  const issue = fixture.provider.issue.getMockImplementation()!;
  const started = deferred<void>();
  fixture.provider.issue.mockImplementationOnce(async (request) => {
    started.resolve();
    await new Promise((done) => setTimeout(done, 31000));
    return issue(request);
  });
  const service = createGiftCardDeliveryService({
    ...fixture,
    timeoutMs: 40000,
  });
  const pending = service.fulfill(order.id);
  await started.promise;
  // A separate connection observes the committed receipt/payment while the
  // supplier is still running; it can also lock and update the row.
  expect(await payments.findOwn(buyer, order.id)).toMatchObject({
    status: "PAID",
    paid_at: expect.any(Date),
    gift_card_code: null,
  });
  expect(
    await prisma.giftCardPaymentEvent.count({ where: { id: event.id } }),
  ).toBe(1);
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
      await tx.giftCardOrder.update({
        where: { id: order.id },
        data: { last_error: null },
      });
    },
    { timeout: 5000 },
  );
  expect((await pending).status).toBe("FULFILLED");
  expect(fixture.create).toHaveBeenCalledTimes(1);
});

test("supplier timeout after external issuance keeps payment and reconciles before replay", async () => {
  const { order, event } = await paidOrder();
  const issue = fixture.provider.issue.getMockImplementation()!;
  fixture.provider.issue.mockImplementationOnce(async (request) => {
    await issue(request); // external ledger committed; response never arrives
    return new Promise(() => {});
  });
  const service = createGiftCardDeliveryService({ ...fixture, timeoutMs: 50 });
  await expect(service.fulfill(order.id)).rejects.toMatchObject({
    statusCode: 503,
    cause: undefined,
  });
  expect(await payments.findOwn(buyer, order.id)).toMatchObject({
    status: "ISSUANCE_FAILED",
    paid_at: expect.any(Date),
    gift_card_code: null,
  });
  expect(
    await prisma.giftCardPaymentEvent.count({ where: { id: event.id } }),
  ).toBe(1);
  expect((await service.fulfill(order.id, buyer)).status).toBe("FULFILLED");
  expect(fixture.provider.reconcile).toHaveBeenCalledWith(
    expect.objectContaining({ request_id: order.id }),
    expect.any(AbortSignal),
  );
  expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
  expect(fixture.create).toHaveBeenCalledTimes(1);
});

test("delivery transaction rollback after external effect is recovered without another issuance", async () => {
  const { order, event } = await paidOrder();
  const issue = fixture.provider.issue.getMockImplementation()!;
  fixture.provider.issue.mockImplementationOnce(async (request) => {
    const delivery = await issue(request);
    // Force a real PostgreSQL unique violation while completing delivery.
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
  const service = createGiftCardDeliveryService(fixture);
  await expect(service.fulfill(order.id)).rejects.toMatchObject({
    statusCode: 503,
    cause: undefined,
  });
  expect(await payments.findOwn(buyer, order.id)).toMatchObject({
    paid_at: expect.any(Date),
    status: "ISSUANCE_FAILED",
    gift_card_code: null,
  });
  expect(
    await prisma.giftCardPaymentEvent.count({ where: { id: event.id } }),
  ).toBe(1);
  expect(await prisma.libraryItem.count({ where: { item_id: order.id } })).toBe(
    0,
  );
  await prisma.giftCardOrder.deleteMany({
    where: { user_id: buyer, product_code: "collision" },
  });
  expect((await service.fulfill(order.id)).status).toBe("FULFILLED");
  expect(fixture.provider.reconcile).toHaveBeenCalledTimes(1);
  expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
  expect(await prisma.libraryItem.count({ where: { item_id: order.id } })).toBe(
    1,
  );
});

test.each(["pending", "unknown"] as const)(
  "uncertain reconciliation (%s) cannot issue again",
  async (status) => {
    const { order } = await paidOrder();
    const service = createGiftCardDeliveryService(fixture);
    fixture.provider.issue.mockRejectedValueOnce(new Error("lost reply"));
    await expect(service.fulfill(order.id)).rejects.toThrow();
    fixture.provider.reconcile.mockResolvedValue({ status });
    await expect(service.fulfill(order.id)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
    expect((await payments.findOwn(buyer, order.id)).paid_at).not.toBeNull();
  },
);

test("expired worker cannot complete or clear a newer claim", async () => {
  const { order } = await paidOrder();
  const result = deferred<{ reference: string; code: string }>();
  const started = deferred<void>();
  fixture.provider.issue.mockImplementationOnce(() => {
    started.resolve();
    return result.promise;
  });
  const service = createGiftCardDeliveryService(fixture);
  const stale = service.fulfill(order.id);
  await started.promise;
  await prisma.giftCardOrder.update({
    where: { id: order.id },
    data: { delivery_claim_expires_at: new Date(0) },
  });
  fixture.provider.reconcile.mockResolvedValueOnce({ status: "pending" });
  await expect(service.fulfill(order.id)).rejects.toMatchObject({
    statusCode: 503,
  });
  const before = await payments.findOwn(buyer, order.id);
  result.resolve({ reference: "stale", code: "synthetic-secret-stale" });
  await expect(stale).rejects.toMatchObject({ statusCode: 503 });
  expect(await payments.findOwn(buyer, order.id)).toMatchObject({
    status: before.status,
    gift_card_code: null,
    delivery_claim_token: before.delivery_claim_token,
  });
});

test("concurrent webhook replay and buyer delivery retry serialize supplier access", async () => {
  const { order, event } = await paidOrder();
  const issue = fixture.provider.issue.getMockImplementation()!;
  const started = deferred<void>();
  const release = deferred<void>();
  fixture.provider.issue.mockImplementationOnce(async (request) => {
    started.resolve();
    await release.promise;
    return issue(request);
  });
  const service = createGiftCardDeliveryService(fixture);
  const first = service.fulfill(order.id);
  await started.promise;
  await payments.receive(event);
  await expect(service.fulfill(order.id, buyer)).rejects.toMatchObject({
    statusCode: 503,
  });
  release.resolve();
  await first;
  expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
  expect(await prisma.libraryItem.count({ where: { item_id: order.id } })).toBe(
    1,
  );
  expect(fixture.create).toHaveBeenCalledTimes(1);
});

test.each([
  { reference: 1, code: "synthetic-secret-invalid" },
  { reference: "x", code: 1 },
  { reference: "", code: "secret" },
])(
  "malformed supplier delivery is rejected without raw payload in error",
  async (malformed) => {
    const { order } = await paidOrder();
    fixture.provider.issue.mockResolvedValueOnce(malformed as never);
    const service = createGiftCardDeliveryService(fixture);
    const error = await service.fulfill(order.id).catch((value) => value);
    expect(error).toMatchObject({ statusCode: 503, cause: undefined });
    expect(JSON.stringify(error)).not.toContain("synthetic-secret");
    expect((await payments.findOwn(buyer, order.id)).gift_card_code).toBeNull();
  },
);
