import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { createGiftCardOrderService } from "models/gift_card_order";
import { createGiftCardPaymentReconciliation } from "models/gift_card_payment_reconciliation";
import {
  checkoutFixture,
  paymentEvent,
} from "tests/fixtures/gift_card_checkout";

let buyer: string;
const buyers: string[] = [];
let fixture: ReturnType<typeof checkoutFixture>;
let orders: ReturnType<typeof createGiftCardOrderService>;
let service: ReturnType<typeof createGiftCardPaymentReconciliation>;
let now: Date;
beforeEach(() => {
  buyer = randomUUID();
  buyers.push(buyer);
  fixture = checkoutFixture();
  orders = createGiftCardOrderService(fixture);
  now = new Date();
  service = createGiftCardPaymentReconciliation({
    ...fixture,
    orders,
    clock: async () => now,
  });
});
afterAll(async () => {
  const all = await prisma.giftCardOrder.findMany({
    where: { user_id: { in: buyers } },
    select: { id: true },
  });
  await prisma.giftCardPaymentEvent.deleteMany({
    where: { order_id: { in: all.map((o) => o.id) } },
  });
  await prisma.giftCardOrder.deleteMany({ where: { user_id: { in: buyers } } });
  await prisma.$disconnect();
});
const begin = () => orders.begin(buyer, "sandbox-brl-25", randomUUID());

test("entry fallback confirms a retrieved paid session without creating another checkout", async () => {
  const order = await begin();
  fixture.pay(order.id);
  expect(await service.reconcileOwn(buyer, order.id)).toMatchObject({
    order: { status: "PAID", paid_at: expect.any(Date) },
    needsDelivery: true,
  });
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.provider.issue).not.toHaveBeenCalled();
  expect(
    await prisma.giftCardPaymentEvent.count({ where: { order_id: order.id } }),
  ).toBe(0);
  // No fabricated webhook receipt: the fallback has its own durable cooldown.
  jest.mocked(fixture.gateway.retrieve).mockClear();
  await service.reconcileOwn(buyer, order.id);
  expect(fixture.gateway.retrieve).not.toHaveBeenCalled();
});

test("cooldown survives a fresh service instance and expires only after 60 seconds", async () => {
  const order = await begin();
  jest.mocked(fixture.gateway.retrieve).mockClear();
  await service.reconcileOwn(buyer, order.id);
  const fresh = createGiftCardPaymentReconciliation({
    ...fixture,
    orders,
    clock: async () => now,
  });
  await fresh.reconcileOwn(buyer, order.id);
  now = new Date(now.getTime() + 59999);
  await fresh.reconcileOwn(buyer, order.id);
  expect(fixture.gateway.retrieve).toHaveBeenCalledTimes(1);
  now = new Date(now.getTime() + 1);
  await fresh.reconcileOwn(buyer, order.id);
  expect(fixture.gateway.retrieve).toHaveBeenCalledTimes(2);
});

test("concurrent tabs query Stripe once", async () => {
  const order = await begin();
  jest.mocked(fixture.gateway.retrieve).mockClear();
  await Promise.all(
    Array.from({ length: 5 }, () => service.reconcileOwn(buyer, order.id)),
  );
  expect(fixture.gateway.retrieve).toHaveBeenCalledTimes(1);
});

test("unavailable Stripe preserves pending status and permits a later entry", async () => {
  const order = await begin();
  jest
    .mocked(fixture.gateway.retrieve)
    .mockRejectedValueOnce(new Error("synthetic timeout"));
  expect(await service.reconcileOwn(buyer, order.id)).toMatchObject({
    order: { status: "AWAITING_PAYMENT", paid_at: null },
    needsDelivery: false,
  });
  expect(await orders.findOwn(buyer, order.id)).toMatchObject({
    payment_reconcile_claim_token: null,
    payment_reconcile_after: expect.any(Date),
  });
  fixture.pay(order.id);
  now = new Date(now.getTime() + 60000);
  expect((await service.reconcileOwn(buyer, order.id)).order.status).toBe(
    "PAID",
  );
});

test.each([
  "amount",
  "currency",
  "mode",
  "reference",
  "session",
  "metadata",
  "livemode",
])("fallback rejects a mismatched %s", async (field) => {
  const order = await begin();
  const session = fixture.pay(order.id);
  if (field === "amount") session.amount_total = 1;
  if (field === "currency") session.currency = "usd";
  if (field === "mode") session.mode = "subscription";
  if (field === "reference") session.client_reference_id = randomUUID();
  if (field === "session") session.id = "cs_other";
  if (field === "metadata")
    session.metadata = { ...session.metadata, order_id: randomUUID() };
  if (field === "livemode") session.livemode = true;
  expect(
    (await service.reconcileOwn(buyer, order.id)).order.paid_at,
  ).toBeNull();
});

test("owner authorization happens before Stripe access", async () => {
  const order = await begin();
  jest.mocked(fixture.gateway.retrieve).mockClear();
  await expect(
    service.reconcileOwn(randomUUID(), order.id),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(fixture.gateway.retrieve).not.toHaveBeenCalled();
});

test("unbound checkout is never recreated by payment reconciliation", async () => {
  const order = await prisma.giftCardOrder.create({
    data: {
      user_id: buyer,
      idempotency_key: randomUUID(),
      product_code: "sandbox-brl-25",
      product_name: "Demo",
      amount_minor: 2500,
      currency: "BRL",
    },
  });
  await service.reconcileOwn(buyer, order.id);
  expect(fixture.create).not.toHaveBeenCalled();
  expect(fixture.gateway.retrieve).not.toHaveBeenCalled();
});

test("webhook and fallback converge on one durable payment reference", async () => {
  const order = await begin();
  const event = paymentEvent(fixture.pay(order.id));
  await Promise.all([
    orders.receive(event),
    service.reconcileOwn(buyer, order.id),
  ]);
  expect(await orders.findOwn(buyer, order.id)).toMatchObject({
    status: "PAID",
    stripe_payment_intent_id: `pi_fixture_${order.id}`,
  });
  expect(
    await prisma.giftCardPaymentEvent.count({ where: { id: event.id } }),
  ).toBe(1);
  expect(fixture.create).toHaveBeenCalledTimes(1);
});

test("bounded query timeout occurs outside a transaction and never confirms a late response", async () => {
  const order = await begin();
  let finish!: (value: ReturnType<typeof fixture.pay>) => void;
  jest.mocked(fixture.gateway.retrieve).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const bounded = createGiftCardPaymentReconciliation({
    ...fixture,
    orders,
    clock: async () => now,
    queryTimeoutMs: 30,
  });
  expect((await bounded.reconcileOwn(buyer, order.id)).order.status).toBe(
    "AWAITING_PAYMENT",
  );
  finish(fixture.pay(order.id));
  await Promise.resolve();
  expect((await orders.findOwn(buyer, order.id)).paid_at).toBeNull();
  now = new Date(now.getTime() + 60000);
  expect((await bounded.reconcileOwn(buyer, order.id)).order.status).toBe(
    "PAID",
  );
});
