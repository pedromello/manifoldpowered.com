import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { Prisma } from "generated/prisma/client";
import {
  createPurchaseOrderService,
  enqueuePurchase,
  enqueuePaymentSignal,
} from "models/purchase_order";
import { createPurchasePaymentWorker } from "models/purchase_payment_jobs";
import revelation from "models/gift_card_revelation";
import type {
  PaymentContext,
  PaymentProvider,
  PaymentSnapshot,
} from "infra/payments/types";
import orchestrator from "tests/orchestrator.js";
import { PaymentTransportError } from "infra/payments/errors";
import { createGiftCardDeliveryService } from "models/gift_card_delivery";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";

// Real PostgreSQL transactions; no real payment API. Only rows owned by this suite are removed.
const users: string[] = [],
  gameIds: string[] = [],
  studioIds: string[] = [];
const originalProvider = process.env.PAYMENT_PROVIDER;
let buyerId: string, ownerId: string, gameId: string, slug: string;
beforeAll(async () => {
  process.env.PAYMENT_PROVIDER = "appmax";
  for (const role of ["buyer", "owner"]) {
    const account = await prisma.user.create({
      data: {
        username: `pay_${role}_${randomUUID().slice(0, 8)}`,
        email: `${randomUUID()}@example.test`,
      },
    });
    users.push(account.id);
  }
  [buyerId, ownerId] = users;
  await prisma.currency.upsert({
    where: { code: "BRL" },
    create: { code: "BRL", symbol: "R$", decimal_places: 2, enabled: true },
    update: {},
  });
  const target = await orchestrator.createGame(ownerId, {
    title: `Payment fixture ${randomUUID()}`,
    price: "5.00",
    status: "ACTIVE",
  });
  gameId = target.id;
  slug = target.slug;
  gameIds.push(target.id);
  studioIds.push(target.studio_id);
  await prisma.game.update({
    where: { id: gameId },
    data: { status: "ACTIVE" },
  });
  await prisma.gamePriceOverride.create({
    data: {
      game_id: gameId,
      currency: "BRL",
      amount: new Prisma.Decimal("25.00"),
    },
  });
});
afterAll(async () => {
  const orders = await prisma.purchaseOrder.findMany({
      where: { user_id: { in: users } },
      select: { id: true },
    }),
    ids = orders.map((order) => order.id);
  const sales = await prisma.sale.findMany({
    where: { user_id: { in: users } },
    select: { id: true },
  });
  await prisma.ledgerEntry.deleteMany({
    where: {
      source_type: "SALE",
      source_id: { in: sales.map((sale) => sale.id) },
    },
  });
  await prisma.sale.deleteMany({ where: { user_id: { in: users } } });
  await prisma.libraryItem.deleteMany({ where: { user_id: { in: users } } });
  await prisma.purchasePaymentJob.deleteMany({
    where: { order_id: { in: ids } },
  });
  await prisma.purchasePaymentEvent.deleteMany({
    where: { order_id: { in: ids } },
  });
  await prisma.purchasePaymentAttempt.deleteMany({
    where: { order_id: { in: ids } },
  });
  await prisma.purchaseOrder.deleteMany({ where: { user_id: { in: users } } });
  await prisma.giftCardPaymentEvent.deleteMany({
    where: { order_id: { in: ids } },
  });
  await prisma.giftCardOrder.deleteMany({ where: { user_id: { in: users } } });
  await prisma.gamePriceOverride.deleteMany({
    where: { game_id: { in: gameIds } },
  });
  await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
  await prisma.studioMember.deleteMany({
    where: { studio_id: { in: studioIds } },
  });
  await prisma.studio.deleteMany({ where: { id: { in: studioIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (originalProvider) process.env.PAYMENT_PROVIDER = originalProvider;
  else delete process.env.PAYMENT_PROVIDER;
  await prisma.$disconnect();
});
function fixture(
  giftDelivery?: ReturnType<typeof createGiftCardDeliveryService>,
) {
  const remote = new Map<string, PaymentSnapshot>();
  let counter = parseInt(randomUUID().replace(/-/g, "").slice(0, 10), 16);
  let failCreate = false,
    losePayment = false,
    state: PaymentSnapshot["state"] = "PROCESSING";
  const createCustomer = jest.fn(async () => "17"),
    createOrder = jest.fn(async () => {
      const id = String(++counter);
      if (failCreate) throw new Error("lost create response");
      return id;
    }),
    pay = jest.fn(async (context: PaymentContext) => {
      const value: PaymentSnapshot = {
        remote_order_id: context.remote_order_id!,
        remote_customer_id: context.customer_id,
        state,
        total_minor: context.amount_minor,
        currency: context.currency,
        method: context.method,
        installments: context.installments,
        paid_at:
          state === "PAID" ? new Date("2026-10-12T15:00:00Z") : undefined,
      };
      remote.set(value.remote_order_id, value);
      if (losePayment) throw new Error("lost payment response");
      return value;
    });
  const provider: PaymentProvider = {
    name: "appmax",
    configured: () => true,
    capabilities: {
      methods: ["pix", "card"],
      hosted: false,
      installments: true,
    },
    quote: async (amount, count) => ({
      installments: count,
      total_minor: amount + (count === 3 ? 300 : 0),
      interest_minor: count === 3 ? 300 : 0,
    }),
    quotes: async (amount) => [
      { installments: 1, total_minor: amount, interest_minor: 0 },
      { installments: 3, total_minor: amount + 300, interest_minor: 300 },
    ],
    createCustomer,
    createOrder,
    pay,
    retrieve: jest.fn(async (context) => remote.get(context.remote_order_id!)!),
  };
  const service = createPurchaseOrderService({
    getProvider: () => provider,
    giftDelivery,
  });
  return {
    service,
    provider,
    pay,
    createOrder,
    remote,
    setState: (value: typeof state) => {
      state = value;
    },
    losePayment: () => {
      losePayment = true;
    },
    failCreate: () => {
      failCreate = true;
    },
  };
}
const details = {
  first_name: "Synthetic",
  last_name: "Buyer",
  email: "buyer@example.test",
  phone: "11999999999",
  document_number: "19100000000",
  ip: "192.0.2.1",
};
async function freshBuyer() {
  const user = await prisma.user.create({
    data: {
      username: `pay_${randomUUID().slice(0, 12)}`,
      email: `${randomUUID()}@example.test`,
    },
  });
  users.push(user.id);
  return user.id;
}
async function start(
  f: ReturnType<typeof fixture>,
  user: string,
  item: "GAME" | "GIFT_CARD" = "GIFT_CARD",
  method: "pix" | "card" = "card",
  installments = 1,
) {
  const order = await f.service.begin(user, {
    item_type: item,
    item_id: item === "GAME" ? slug : "sandbox-brl-25",
    idempotency_key: randomUUID(),
  });
  const attempt = await f.service.quote(user, order.id, {
    method,
    installments,
    idempotency_key: randomUUID(),
  });
  return {
    order,
    attempt,
    submit: () =>
      f.service.submit(user, order.id, {
        attempt_id: attempt.id,
        expected_total_minor: attempt.total_minor,
        buyer: details,
        card_token: "synthetic-token",
      }),
  };
}
test("two tabs create one order and perform one charge", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    key = randomUUID();
  const [a, b] = await Promise.all([
    f.service.begin(user, {
      item_type: "GIFT_CARD",
      item_id: "sandbox-brl-25",
      idempotency_key: key,
    }),
    f.service.begin(user, {
      item_type: "GIFT_CARD",
      item_id: "sandbox-brl-25",
      idempotency_key: randomUUID(),
    }),
  ]);
  expect(a.id).toBe(b.id);
  const attempt = await f.service.quote(user, a.id, {
    method: "card",
    installments: 1,
    idempotency_key: randomUUID(),
  });
  const input = {
    attempt_id: attempt.id,
    expected_total_minor: 2500,
    buyer: details,
    card_token: "synthetic",
  };
  await Promise.all([
    f.service.submit(user, a.id, input),
    f.service.submit(user, a.id, input),
  ]);
  expect(f.pay).toHaveBeenCalledTimes(1);
  expect(f.createOrder).toHaveBeenCalledTimes(1);
  expect((await f.service.findOwn(user, a.id)).paid_at).toBeNull();
});
test("authorized card does not unlock a game; confirmation creates one sale and balanced ledger using snapshots", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user, "GAME", "card", 3);
  await purchase.submit();
  expect(await prisma.libraryItem.count({ where: { user_id: user } })).toBe(0);
  expect(await prisma.sale.count({ where: { user_id: user } })).toBe(0);
  const value = [...f.remote.values()][0];
  value.state = "PAID";
  value.paid_at = new Date("2026-10-12T15:00:00Z");
  await prisma.gamePriceOverride.update({
    where: { game_id_currency: { game_id: gameId, currency: "BRL" } },
    data: { amount: new Prisma.Decimal("99") },
  });
  await f.service.reconcile(purchase.order.id);
  await f.service.reconcile(purchase.order.id);
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { purchase_order_id: purchase.order.id },
  });
  expect(sale.price_at_sale.toFixed(2)).toBe("25.00");
  const entries = await prisma.ledgerEntry.findMany({
    where: { source_type: "SALE", source_id: sale.id },
  });
  expect(
    entries
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
      .toString(),
  ).toBe("0");
  expect(
    entries
      .find((row) => row.account_type === "CONSUMER_PAYMENT")!
      .amount.toFixed(2),
  ).toBe("28.00");
  expect(
    entries
      .find((row) => row.account_type === "FINANCING_CLEARING")!
      .amount.toFixed(2),
  ).toBe("-3.00");
  expect(
    await prisma.sale.count({
      where: { purchase_order_id: purchase.order.id },
    }),
  ).toBe(1);
  expect(await prisma.libraryItem.count({ where: { user_id: user } })).toBe(1);
  await prisma.gamePriceOverride.update({
    where: { game_id_currency: { game_id: gameId, currency: "BRL" } },
    data: { amount: new Prisma.Decimal("25") },
  });
});
test("lost financial response is queried, never charged again, and gift disclosure is stable", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user, "GIFT_CARD", "pix");
  f.setState("PAID");
  f.losePayment();
  const pending = await purchase.submit();
  expect(pending.attempt?.uncertain).toBe(true);
  await purchase.submit();
  expect(f.pay).toHaveBeenCalledTimes(1);
  await f.service.reconcile(purchase.order.id);
  await f.service.reconcile(purchase.order.id);
  const first = await revelation.revealOwn(
    user,
    purchase.order.gift_card_order_id!,
  );
  const repeated = await revelation.revealOwn(
    user,
    purchase.order.gift_card_order_id!,
  );
  expect(first.first_revealed_at).toBe(repeated.first_revealed_at);
  expect(first.gift_card_code).toContain("SIMULATED");
  expect(
    (await f.service.findOwn(user, purchase.order.id)).delivery_status,
  ).toBe("READY");
});
test("uncertain remote order creation blocks new attempts, cancellation and provider switching", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  f.failCreate();
  await purchase.submit();
  process.env.PAYMENT_PROVIDER = "stripe";
  expect(
    (await f.service.findOwn(user, purchase.order.id)).payment_provider,
  ).toBe("appmax");
  await purchase.submit();
  expect(f.createOrder).toHaveBeenCalledTimes(1);
  expect(f.pay).not.toHaveBeenCalled();
  await expect(
    f.service.quote(user, purchase.order.id, {
      method: "card",
      installments: 1,
      idempotency_key: randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(f.service.cancel(user, purchase.order.id)).rejects.toThrow();
  await expect(f.service.reconcile(purchase.order.id)).rejects.toThrow(
    "review",
  );
  process.env.PAYMENT_PROVIDER = "appmax";
});
test("a failure before remote order creation permits a new quote without risking another charge", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  (f.provider.createCustomer as jest.Mock).mockRejectedValueOnce(
    new Error("synthetic authentication failure"),
  );
  await purchase.submit();
  expect(f.createOrder).not.toHaveBeenCalled();
  expect(f.pay).not.toHaveBeenCalled();
  expect(await f.service.view(user, purchase.order.id)).toMatchObject({
    order: { payment_status: "FAILED", can_pay: true },
    attempt: { uncertain: false },
  });
  const next = await f.service.quote(user, purchase.order.id, {
    method: "pix",
    installments: 1,
    idempotency_key: randomUUID(),
  });
  expect(next.id).not.toBe(purchase.attempt.id);
});
test("wrong amount and another buyer cannot charge or obtain a private checkout", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  await expect(f.service.view(buyerId, purchase.order.id)).rejects.toThrow();
  await expect(
    f.service.submit(user, purchase.order.id, {
      attempt_id: purchase.attempt.id,
      expected_total_minor: 1,
      buyer: details,
    }),
  ).rejects.toThrow();
  expect(f.pay).not.toHaveBeenCalled();
  await prisma.purchasePaymentAttempt.update({
    where: { id: purchase.attempt.id },
    data: { quote_expires_at: new Date(Date.now() - 1000) },
  });
  await expect(purchase.submit()).rejects.toThrow();
  expect(f.pay).not.toHaveBeenCalled();
});

test("another tab cannot mutate an accepted quote or its installments", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  const changed = await f.service.quote(user, purchase.order.id, {
    method: "card",
    installments: 3,
    idempotency_key: randomUUID(),
  });
  expect(changed.id).not.toBe(purchase.attempt.id);
  await expect(purchase.submit()).rejects.toThrow();
  expect(f.pay).not.toHaveBeenCalled();
});

test("the same remote financial order cannot grant two purchases", async () => {
  const f = fixture(),
    firstUser = await freshBuyer(),
    secondUser = await freshBuyer();
  const first = await start(f, firstUser),
    second = await start(f, secondUser);
  await first.submit();
  const bound = await prisma.purchasePaymentAttempt.findUniqueOrThrow({
    where: { id: first.attempt.id },
  });
  await expect(
    prisma.purchasePaymentAttempt.update({
      where: { id: second.attempt.id },
      data: { remote_order_id: bound.remote_order_id },
    }),
  ).rejects.toMatchObject({ code: "P2002" });
});
test("mismatched paid confirmation never releases a product", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  await purchase.submit();
  const value = [...f.remote.values()][0];
  value.state = "PAID";
  value.total_minor = 1;
  await expect(f.service.reconcile(purchase.order.id)).rejects.toThrow();
  expect((await f.service.findOwn(user, purchase.order.id)).paid_at).toBeNull();
  expect(
    (
      await prisma.giftCardOrder.findUniqueOrThrow({
        where: { id: purchase.order.id },
      })
    ).gift_card_code,
  ).toBeNull();
});
test("a provider hold blocks fulfillment without erasing payment confirmation", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user, "GAME");
  await purchase.submit();
  const value = [...f.remote.values()][0];
  value.delivery_blocked = true;
  await f.service.reconcile(purchase.order.id);
  expect(
    (await f.service.findOwn(user, purchase.order.id)).delivery_status,
  ).toBe("REVIEW");
  value.delivery_blocked = false;
  value.state = "PAID";
  value.paid_at = new Date();
  await f.service.reconcile(purchase.order.id);
  expect(await f.service.findOwn(user, purchase.order.id)).toMatchObject({
    payment_status: "PAID",
    paid_at: expect.any(Date),
    delivery_status: "REVIEW",
  });
  expect(await prisma.libraryItem.count({ where: { user_id: user } })).toBe(0);
});
test("refund stops a pending delivery; old failures cannot undo payment history", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  f.setState("PAID");
  await purchase.submit();
  const order = await f.service.findOwn(user, purchase.order.id),
    attempt = await prisma.purchasePaymentAttempt.findUniqueOrThrow({
      where: { id: purchase.attempt.id },
    }),
    value = [...f.remote.values()][0];
  await f.service.applySnapshot(order.id, attempt.id, {
    ...value,
    state: "FAILED",
  });
  expect((await f.service.findOwn(user, order.id)).payment_status).toBe("PAID");
  await f.service.applySnapshot(order.id, attempt.id, {
    ...value,
    state: "REFUNDED",
  });
  await f.service.deliver(order.id);
  const refunded = await f.service.findOwn(user, order.id);
  expect(refunded.payment_status).toBe("REFUNDED");
  expect(refunded.paid_at).toEqual(order.paid_at);
  expect(refunded.delivery_status).toBe("REVIEW");
  await f.service.applySnapshot(order.id, attempt.id, {
    ...value,
    state: "REFUNDED",
  });
  expect(
    await prisma.purchasePaymentEvent.count({
      where: { order_id: order.id, payment_status: "REFUNDED" },
    }),
  ).toBe(1);
  expect(
    (await prisma.giftCardOrder.findUniqueOrThrow({ where: { id: order.id } }))
      .gift_card_code,
  ).toBeNull();
});
test("persisted jobs survive a worker restart and concurrent workers claim once", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  await purchase.submit();
  const value = [...f.remote.values()][0];
  value.state = "PAID";
  value.paid_at = new Date();
  // Isolate this job's due time; other suite orders must not call a different fixture.
  const ids = (
    await prisma.purchaseOrder.findMany({
      where: { user_id: { in: users } },
      select: { id: true },
    })
  ).map((row) => row.id);
  await prisma.purchasePaymentJob.updateMany({
    where: { order_id: { in: ids } },
    data: { run_after: new Date(Date.now() + 3600000) },
  });
  await enqueuePurchase(purchase.order.id);
  const first = createPurchasePaymentWorker({ orders: f.service }),
    restarted = createPurchasePaymentWorker({ orders: f.service });
  await Promise.all([
    first.runOne(purchase.order.id),
    restarted.runOne(purchase.order.id),
  ]);
  expect(
    (await f.service.findOwn(user, purchase.order.id)).delivery_status,
  ).toBe("READY");
  expect(f.pay).toHaveBeenCalledTimes(1);
});
test("a delayed notification reconciles its original attempt and preserves the paid quote", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  f.setState("FAILED");
  await purchase.submit();
  const second = await f.service.quote(user, purchase.order.id, {
    method: "card",
    installments: 3,
    idempotency_key: randomUUID(),
  });
  const original = [...f.remote.values()][0];
  original.state = "PAID";
  original.paid_at = new Date();
  await enqueuePaymentSignal(purchase.order.id, purchase.attempt.id);
  await f.service.reconcile(purchase.order.id);
  const view = await f.service.view(user, purchase.order.id);
  expect(view.order.payment_status).toBe("PAID");
  expect(view.order.total_minor).toBe(purchase.attempt.total_minor);
  expect(view.attempt?.id).toBe(purchase.attempt.id);
  expect(view.attempt?.id).not.toBe(second.id);
  expect(f.pay).toHaveBeenCalledTimes(1);
});
test("worker honors provider retry-after even when a notification arrives during its claim", async () => {
  const f = fixture(),
    user = await freshBuyer(),
    purchase = await start(f, user);
  await enqueuePurchase(purchase.order.id);
  const orders = {
    reconcile: async () => {
      await enqueuePurchase(purchase.order.id);
      throw new PaymentTransportError(120);
    },
  };
  await createPurchasePaymentWorker({ orders }).runOne(purchase.order.id);
  const job = await prisma.purchasePaymentJob.findUniqueOrThrow({
    where: { order_id: purchase.order.id },
  });
  expect(job.run_after.getTime()).toBeGreaterThan(Date.now() + 115000);
  expect(job.claim_token).toBeNull();
});
test.each(["GAME", "GIFT_CARD"] as const)(
  "Pix for %s grants the product only after trusted confirmation",
  async (item) => {
    const f = fixture(),
      user = await freshBuyer(),
      purchase = await start(f, user, item, "pix");
    f.setState("PENDING");
    await purchase.submit();
    expect(
      (await f.service.findOwn(user, purchase.order.id)).delivery_status,
    ).toBe("PENDING");
    expect(await prisma.libraryItem.count({ where: { user_id: user } })).toBe(
      0,
    );
    const remote = [...f.remote.values()][0];
    remote.state = "PAID";
    remote.paid_at = new Date();
    await f.service.reconcile(purchase.order.id);
    expect(
      (await f.service.findOwn(user, purchase.order.id)).delivery_status,
    ).toBe("READY");
    expect(await prisma.libraryItem.count({ where: { user_id: user } })).toBe(
      1,
    );
  },
);
test("refund during gift issuance is committed and prevents code delivery", async () => {
  let began!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
      began = resolve;
    }),
    pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
  const delivery = createGiftCardDeliveryService({
    provider: {
      ...simulatedGiftCardProvider,
      issue: async (request, signal) => {
        began();
        await pending;
        return simulatedGiftCardProvider.issue(request, signal);
      },
    },
  });
  const f = fixture(delivery),
    user = await freshBuyer(),
    purchase = await start(f, user);
  f.setState("PAID");
  await purchase.submit();
  const sending = f.service.deliver(purchase.order.id),
    rejected = expect(sending).rejects.toThrow();
  await started;
  await f.service.applySnapshot(purchase.order.id, purchase.attempt.id, {
    ...[...f.remote.values()][0],
    state: "REFUNDED",
  });
  finish();
  await rejected;
  expect(await f.service.findOwn(user, purchase.order.id)).toMatchObject({
    payment_status: "REFUNDED",
    delivery_status: "REVIEW",
  });
  expect(
    await prisma.giftCardOrder.findUniqueOrThrow({
      where: { id: purchase.order.id },
    }),
  ).toMatchObject({ status: "CANCELLED", gift_card_code: null });
  expect(await prisma.libraryItem.count({ where: { user_id: user } })).toBe(0);
});
