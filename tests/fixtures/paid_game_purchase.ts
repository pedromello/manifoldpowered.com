import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { Prisma } from "generated/prisma/client";
import {
  createPurchaseOrderService,
  enqueuePaymentSignal,
} from "models/purchase_order";
import { createPurchasePaymentWorker } from "models/purchase_payment_jobs";
import { appmaxCheckoutFixture } from "tests/fixtures/appmax_checkout";

// Complete the real payment domain between the HTTP login and HTTP library /
// download / review steps. Only the external Appmax HTTP transport is simulated.
// Called with the buyer and game created by these disposable integration suites.
export async function purchaseGameWithVerifiedPayment(
  userId: string,
  slug: string,
  storeSlug?: string,
) {
  const overrides = {
    PAYMENT_PROVIDER: "appmax",
    PAYMENT_ENVIRONMENT: "sandbox",
    APPMAX_CLIENT_ID: "synthetic-use-case-client",
    APPMAX_CLIENT_SECRET: "synthetic-use-case-secret",
    APPMAX_AUTH_URL: "https://auth.sandboxappmax.com.br/oauth2/token",
    APPMAX_API_URL: "https://api.sandboxappmax.com.br",
  };
  const previous = Object.fromEntries(
    Object.keys(overrides).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, overrides);
  try {
    const game = await prisma.game.findUniqueOrThrow({ where: { slug } });
    const buyer = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await prisma.currency.upsert({
      where: { code: "BRL" },
      create: { code: "BRL", symbol: "R$", decimal_places: 2, enabled: true },
      update: {},
    });
    // Explicit test catalog price; the payment uses the price resolved by the
    // server rather than accepting a client-supplied charge amount.
    await prisma.gamePriceOverride.upsert({
      where: { game_id_currency: { game_id: game.id, currency: "BRL" } },
      create: {
        game_id: game.id,
        currency: "BRL",
        amount: new Prisma.Decimal("50.00"),
      },
      update: { amount: new Prisma.Decimal("50.00") },
    });
    const fixture = appmaxCheckoutFixture();
    const orders = createPurchaseOrderService({
      getProvider: () => fixture.provider,
    });
    const worker = createPurchasePaymentWorker({ orders });
    const order = await orders.begin(userId, {
      item_type: "GAME",
      item_id: slug,
      idempotency_key: randomUUID(),
      ...(storeSlug ? { store_slug: storeSlug } : {}),
    });
    const attempt = await orders.quote(userId, order.id, {
      method: "pix",
      installments: 1,
      idempotency_key: randomUUID(),
    });
    const pending = await orders.submit(userId, order.id, {
      attempt_id: attempt.id,
      expected_total_minor: attempt.total_minor,
      buyer: {
        first_name: "Synthetic",
        last_name: "Buyer",
        email: buyer.email,
        phone: "11999999999",
        document_number: "19100000000",
        ip: "192.0.2.1",
      },
    });
    expect(pending.order.payment_status).toBe("PENDING");
    expect(
      await prisma.libraryItem.count({
        where: { user_id: userId, item_id: game.id, item_type: "GAME" },
      }),
    ).toBe(0);
    const submitted = await prisma.purchasePaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    fixture.approve(submitted.remote_order_id!);
    await enqueuePaymentSignal(order.id, attempt.id);
    expect(await worker.runOne(order.id)).toBe(true);
    expect((await orders.view(userId, order.id)).order).toMatchObject({
      payment_status: "PAID",
      delivery_status: "READY",
      total_minor: 5000,
    });
    expect(
      await prisma.libraryItem.count({
        where: { user_id: userId, item_id: game.id, item_type: "GAME" },
      }),
    ).toBe(1);
    return order;
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
