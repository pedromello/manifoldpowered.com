import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import revelation, {
  assertGiftCardNotRevealed,
} from "models/gift_card_revelation";
import { lockGiftCardOrder, giftCardOrderOutput } from "models/gift_card_order";
import {
  checkoutFixture,
  checkoutFlowFixture,
  paymentEvent,
} from "tests/fixtures/gift_card_checkout";

let buyer: string;
const buyers: string[] = [];
beforeEach(() => {
  buyer = randomUUID();
  buyers.push(buyer);
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
async function delivered() {
  const fixture = checkoutFixture();
  const flow = checkoutFlowFixture(fixture);
  const order = await flow.begin(buyer, "sandbox-brl-25", randomUUID());
  await flow.receive(paymentEvent(fixture.pay(order.id)));
  return flow.findOwn(buyer, order.id);
}

test("normal projection omits codes even after first disclosure", async () => {
  const order = await delivered();
  expect(giftCardOrderOutput(order)).not.toHaveProperty("gift_card_code");
  const result = await revelation.revealOwn(buyer, order.id);
  const saved = await prisma.giftCardOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(result).toEqual({
    gift_card_code: order.gift_card_code,
    first_revealed_at: saved.first_revealed_at!.toISOString(),
  });
  expect(giftCardOrderOutput(saved)).not.toHaveProperty("gift_card_code");
});

test("lost response and concurrent repeats retain the first committed timestamp", async () => {
  const order = await delivered();
  await revelation.revealOwn(buyer, order.id); // client loses the response
  const before = await prisma.giftCardOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => revelation.revealOwn(buyer, order.id)),
  );
  expect(new Set(results.map((r) => r.first_revealed_at))).toEqual(
    new Set([before.first_revealed_at!.toISOString()]),
  );
  expect(results.every((r) => r.gift_card_code === order.gift_card_code)).toBe(
    true,
  );
});

test("another buyer cannot obtain code or change disclosure timestamp", async () => {
  const order = await delivered();
  await expect(
    revelation.revealOwn(randomUUID(), order.id),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(
    (await prisma.giftCardOrder.findUniqueOrThrow({ where: { id: order.id } }))
      .first_revealed_at,
  ).toBeNull();
});

test("undelivered and cancelled orders cannot reveal", async () => {
  const fixture = checkoutFixture();
  const flow = checkoutFlowFixture(fixture);
  const order = await flow.begin(buyer, "sandbox-brl-25", randomUUID());
  await expect(revelation.revealOwn(buyer, order.id)).rejects.toMatchObject({
    statusCode: 409,
  });
  await flow.cancel(buyer, order.id);
  await expect(revelation.revealOwn(buyer, order.id)).rejects.toMatchObject({
    statusCode: 409,
  });
});

test("a deferred PostgreSQL commit failure returns no code and rolls back disclosure", async () => {
  const order = await delivered();
  // Per-order deferred trigger tests failure at COMMIT, after the callback
  // prepared a response; it does not affect parallel suites or other orders.
  const trigger = `reveal_fail_${order.id.replaceAll("-", "")}`;
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${order.id}' AND NEW.first_revealed_at IS NOT NULL THEN RAISE EXCEPTION 'synthetic-secret-commit'; END IF; RETURN NEW; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE CONSTRAINT TRIGGER ${trigger} AFTER UPDATE ON gift_card_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  try {
    const error = await revelation.revealOwn(buyer, order.id).catch((e) => e);
    expect(error).toMatchObject({ statusCode: 503, cause: undefined });
    expect(JSON.stringify(error)).not.toContain("synthetic-secret-commit");
    expect(error).not.toHaveProperty("gift_card_code");
    expect(
      (
        await prisma.giftCardOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).first_revealed_at,
    ).toBeNull();
  } finally {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER ${trigger} ON gift_card_orders`,
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
  }
});

// This is the boundary contract for a FUTURE refund implementation, not a
// refund system or an assertion that a refund was executed externally.
async function reserveRefundForTest(id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await lockGiftCardOrder(tx, id, buyer);
    assertGiftCardNotRevealed(order);
    await tx.giftCardOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return "reserved";
  });
}

test("shared order lock makes concurrent disclosure/refund reservation mutually exclusive", async () => {
  const order = await delivered();
  const results = await Promise.allSettled([
    revelation.revealOwn(buyer, order.id),
    reserveRefundForTest(order.id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(
    rejected?.status === "rejected" ? rejected.reason : null,
  ).toMatchObject({ statusCode: 409 });
  const saved = await prisma.giftCardOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  if (saved.first_revealed_at) expect(saved.status).toBe("FULFILLED");
  else expect(saved.status).toBe("CANCELLED");
});
