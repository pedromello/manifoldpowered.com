import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import {
  createGiftCardOrderService,
  giftCardOrderOutput,
} from "models/gift_card_order";
import {
  checkoutFixture,
  paymentEvent,
} from "tests/fixtures/gift_card_checkout";

const buyerIds: string[] = [];
let buyer: string;
let fixture: ReturnType<typeof checkoutFixture>;
let service: ReturnType<typeof createGiftCardOrderService>;
beforeEach(() => {
  buyer = randomUUID();
  buyerIds.push(buyer);
  fixture = checkoutFixture();
  service = createGiftCardOrderService(fixture);
});
afterAll(async () => {
  const orders = await prisma.giftCardOrder.findMany({
    where: { user_id: { in: buyerIds } },
    select: { id: true },
  });
  const ids = orders.map((order) => order.id);
  await prisma.giftCardPaymentEvent.deleteMany({
    where: { order_id: { in: ids } },
  });
  await prisma.libraryItem.deleteMany({ where: { user_id: { in: buyerIds } } });
  await prisma.giftCardOrder.deleteMany({
    where: { user_id: { in: buyerIds } },
  });
  await prisma.$disconnect();
});
const begin = () => service.begin(buyer, "sandbox-brl-25", randomUUID());

describe("gift card buyer checkout with real PostgreSQL and payment fixtures", () => {
  test("snapshots the server price and grants nothing before webhook confirmation", async () => {
    const order = await begin();
    expect(order).toMatchObject({
      amount_minor: 2500,
      currency: "BRL",
      status: "AWAITING_PAYMENT",
      paid_at: null,
      gift_card_code: null,
    });
    fixture.pay(order.id);
    // Reading, replaying checkout and returning from success do not deliver.
    expect((await service.findOwn(buyer, order.id)).status).toBe(
      "AWAITING_PAYMENT",
    );
    expect((await service.checkout(buyer, order.id)).status).toBe(
      "AWAITING_PAYMENT",
    );
    expect(fixture.provider.issue).not.toHaveBeenCalled();
    expect(
      await prisma.libraryItem.count({ where: { item_id: order.id } }),
    ).toBe(0);
    await expect(service.retryIssuance(buyer, order.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    await service.receive(paymentEvent(fixture.getSession(order.id)));
    expect((await service.findOwn(buyer, order.id)).status).toBe("FULFILLED");
    expect(
      await prisma.libraryItem.count({
        where: { item_id: order.id, item_type: "GIFT_CARD" },
      }),
    ).toBe(1);
  });

  test("concurrent retries use a single checkout, including different request keys", async () => {
    const key = randomUUID();
    const orders = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.begin(buyer, "sandbox-brl-25", key),
      ),
    );
    expect(new Set(orders.map((order) => order.id)).size).toBe(1);
    expect(fixture.create).toHaveBeenCalledTimes(1);
    await expect(
      service.begin(buyer, "sandbox-brl-25", randomUUID()),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.begin(buyer, "sandbox-brl-50", key),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(fixture.sessions.size).toBe(1);
  });

  test("concurrent distinct requests cannot create two active orders", async () => {
    const results = await Promise.allSettled([begin(), begin(), begin()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(
      await prisma.giftCardOrder.count({ where: { user_id: buyer } }),
    ).toBe(1);
  });

  test("concurrent duplicate and distinct success notifications deliver once", async () => {
    const order = await begin();
    const event = paymentEvent(fixture.pay(order.id));
    await Promise.all([
      service.receive(event),
      service.receive(event),
      service.receive(paymentEvent(fixture.getSession(order.id))),
    ]);
    expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
    expect(
      await prisma.libraryItem.count({ where: { item_id: order.id } }),
    ).toBe(1);
    const saved = await service.findOwn(buyer, order.id);
    expect(saved.gift_card_code).toContain("SIMULATED-NOT-REDEEMABLE");
    await service.retryIssuance(buyer, order.id);
    expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
  });

  test("unpaid completion waits; later signed success is required", async () => {
    const order = await begin();
    const session = fixture.getSession(order.id);
    session.status = "complete";
    const event = paymentEvent(session);
    await service.receive(event);
    expect(fixture.provider.issue).not.toHaveBeenCalled();
    fixture.pay(order.id);
    await service.receive(
      paymentEvent(session, "checkout.session.async_payment_succeeded"),
    );
    expect((await service.findOwn(buyer, order.id)).status).toBe("FULFILLED");
  });

  test("retrying the same success event can reconcile a later paid state", async () => {
    const order = await begin();
    const event = paymentEvent(fixture.getSession(order.id));
    await service.receive(event);
    fixture.pay(order.id);
    await service.receive(event);
    expect(fixture.provider.issue).toHaveBeenCalledTimes(1);
  });

  test("issuance failure preserves payment and retries without a second charge", async () => {
    const order = await begin();
    const event = paymentEvent(fixture.pay(order.id));
    fixture.provider.issue.mockRejectedValueOnce(
      new Error("synthetic provider error"),
    );
    await expect(service.receive(event)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(await service.findOwn(buyer, order.id)).toMatchObject({
      status: "ISSUANCE_FAILED",
      last_error: "ISSUANCE_FAILED",
    });
    expect(
      await prisma.libraryItem.count({ where: { item_id: order.id } }),
    ).toBe(0);
    const freshWorker = createGiftCardOrderService(fixture);
    await Promise.all([
      freshWorker.receive(event),
      freshWorker.retryIssuance(buyer, order.id),
    ]);
    expect((await service.findOwn(buyer, order.id)).status).toBe("FULFILLED");
    expect(fixture.create).toHaveBeenCalledTimes(1);
    expect(
      fixture.provider.issue.mock.calls.map(([input]) => input.request_id),
    ).toEqual([order.id, order.id]);
    expect(
      await prisma.giftCardPaymentEvent.count({ where: { id: event.id } }),
    ).toBe(1);
  });

  test("lost checkout response is recovered using the same Stripe idempotency key", async () => {
    const create = fixture.create.getMockImplementation()!;
    fixture.create.mockImplementationOnce(async (input) => {
      await create(input);
      throw new Error("synthetic network interruption");
    });
    const key = randomUUID();
    await expect(service.begin(buyer, "sandbox-brl-25", key)).rejects.toThrow();
    const pending = await prisma.giftCardOrder.findFirstOrThrow({
      where: { user_id: buyer },
    });
    expect(pending).toMatchObject({
      status: "CHECKOUT_PENDING",
      stripe_session_id: null,
    });
    const order = await service.begin(buyer, "sandbox-brl-25", key);
    expect(order.id).toBe(pending.id);
    expect(fixture.sessions.size).toBe(1);
    expect(fixture.create.mock.calls.map(([input]) => input.order_id)).toEqual([
      order.id,
      order.id,
    ]);
  });

  test("webhook reconciles a paid session even if its creation response was lost", async () => {
    const create = fixture.create.getMockImplementation()!;
    fixture.create.mockImplementationOnce(async (input) => {
      await create(input);
      throw new Error("synthetic network interruption");
    });
    await expect(begin()).rejects.toThrow();
    const order = await prisma.giftCardOrder.findFirstOrThrow({
      where: { user_id: buyer },
    });
    await service.receive(paymentEvent(fixture.pay(order.id)));
    expect(await service.findOwn(buyer, order.id)).toMatchObject({
      status: "FULFILLED",
      stripe_session_id: fixture.getSession(order.id).id,
    });
  });

  test("uncertain requests older than the Stripe recovery window never recreate checkout", async () => {
    const order = await prisma.giftCardOrder.create({
      data: {
        user_id: buyer,
        idempotency_key: randomUUID(),
        product_code: "sandbox-brl-25",
        product_name: "Demo",
        amount_minor: 2500,
        currency: "BRL",
        checkout_started_at: new Date(Date.now() - 24 * 3600000),
      },
    });
    await expect(service.checkout(buyer, order.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(fixture.create).not.toHaveBeenCalled();
  });

  test("explicit cancellation expires Stripe checkout; new purchase requires a new request", async () => {
    const key = randomUUID();
    const order = await service.begin(buyer, "sandbox-brl-25", key);
    expect((await service.cancel(buyer, order.id)).status).toBe("CANCELLED");
    expect(fixture.gateway.expire).toHaveBeenCalledTimes(1);
    expect((await service.begin(buyer, "sandbox-brl-25", key)).id).toBe(
      order.id,
    );
    expect(fixture.create).toHaveBeenCalledTimes(1);
    const next = await begin();
    expect(next.id).not.toBe(order.id);
    expect(fixture.provider.issue).not.toHaveBeenCalled();
  });

  test("cancelling a paid checkout waits for webhook; it never delivers or cancels", async () => {
    const order = await begin();
    fixture.pay(order.id);
    expect((await service.cancel(buyer, order.id)).status).toBe(
      "AWAITING_PAYMENT",
    );
    expect(fixture.gateway.expire).not.toHaveBeenCalled();
    expect(fixture.provider.issue).not.toHaveBeenCalled();
    await service.receive(paymentEvent(fixture.getSession(order.id)));
    expect((await service.cancel(buyer, order.id)).status).toBe("FULFILLED");
  });

  test.each([
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
  ])("%s ends an unpaid purchase without delivery", async (type) => {
    const order = await begin();
    const session = fixture.getSession(order.id);
    session.status = type.endsWith("expired") ? "expired" : "complete";
    await service.receive(paymentEvent(session, type));
    const saved = await service.findOwn(buyer, order.id);
    expect(saved.status).toBe(
      type.endsWith("expired") ? "CANCELLED" : "PAYMENT_FAILED",
    );
    expect(saved.gift_card_code).toBeNull();
    expect(fixture.provider.issue).not.toHaveBeenCalled();
  });

  test("card decline leaves the same checkout resumable instead of allowing another charge", async () => {
    const order = await begin();
    const session = fixture.getSession(order.id);
    session.payment_intent = "pi_fixture_declined";
    const event = paymentEvent(session, "payment_intent.payment_failed");
    event.data.object = {
      id: session.payment_intent,
      metadata: session.metadata,
    } as typeof event.data.object;
    await service.receive(event);
    expect(await service.findOwn(buyer, order.id)).toMatchObject({
      status: "AWAITING_PAYMENT",
      last_error: "PAYMENT_ATTEMPT_FAILED",
    });
    await expect(begin()).rejects.toMatchObject({ statusCode: 409 });
    expect(fixture.provider.issue).not.toHaveBeenCalled();
  });

  test("out-of-order negative events cannot undo a reliable payment", async () => {
    const order = await begin();
    fixture.provider.issue.mockRejectedValueOnce(
      new Error("synthetic failure"),
    );
    await expect(
      service.receive(paymentEvent(fixture.pay(order.id))),
    ).rejects.toThrow();
    await service.receive(
      paymentEvent(fixture.getSession(order.id), "checkout.session.expired"),
    );
    expect((await service.findOwn(buyer, order.id)).status).toBe(
      "ISSUANCE_FAILED",
    );
    await service.retryIssuance(buyer, order.id);
    await service.receive(
      paymentEvent(
        fixture.getSession(order.id),
        "checkout.session.async_payment_failed",
      ),
    );
    expect((await service.findOwn(buyer, order.id)).status).toBe("FULFILLED");
  });

  test.each(["amount", "currency", "reference", "session", "livemode"])(
    "refuses a paid checkout with mismatched %s",
    async (field) => {
      const order = await begin();
      const session = fixture.pay(order.id);
      if (field === "amount") session.amount_total = 1;
      if (field === "currency") session.currency = "usd";
      if (field === "reference") session.client_reference_id = randomUUID();
      if (field === "session") session.id = "cs_test_other";
      if (field === "livemode") session.livemode = true;
      await expect(service.receive(paymentEvent(session))).rejects.toThrow();
      expect(fixture.provider.issue).not.toHaveBeenCalled();
      expect((await service.findOwn(buyer, order.id)).paid_at).toBeNull();
    },
  );

  test("ownership is enforced on reads and every mutation; sensitive fields stay private", async () => {
    const order = await begin();
    const otherBuyer = randomUUID();
    for (const operation of [
      service.findOwn,
      service.checkout,
      service.cancel,
      service.retryIssuance,
    ]) {
      await expect(operation(otherBuyer, order.id)).rejects.toMatchObject({
        statusCode: 404,
      });
    }
    expect(await service.listOwn(otherBuyer)).toEqual([]);
    const output = giftCardOrderOutput(order);
    expect(output).not.toHaveProperty("user_id");
    expect(output).not.toHaveProperty("stripe_session_id");
    expect(output).not.toHaveProperty("idempotency_key");
    expect(output.gift_card_code).toBeNull();
  });

  test("unknown products cannot create an order or start payment", async () => {
    await expect(
      service.begin(buyer, "not-in-catalogue", randomUUID()),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(
      await prisma.giftCardOrder.count({ where: { user_id: buyer } }),
    ).toBe(0);
  });
});
