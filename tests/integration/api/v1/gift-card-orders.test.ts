import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

const endpoint = () => `${webserver.getOrigin()}/api/v1/gift-card-orders`;
let cookie: string;
let buyerId: string;
let orderId: string;
beforeAll(async () => {
  await orchestrator.waitForAllServices();
  const buyer = await orchestrator.createUser();
  buyerId = buyer.id;
  await orchestrator.activateUser(buyer.id);
  const session = await orchestrator.createSession(buyer.id);
  cookie = `session_id=${session.token}`;
  const order = await prisma.giftCardOrder.create({
    data: {
      user_id: buyer.id,
      idempotency_key: randomUUID(),
      product_code: "sandbox-brl-25",
      product_name: "Demo",
      amount_minor: 2500,
      currency: "BRL",
    },
  });
  orderId = order.id;
});
afterAll(async () => {
  await prisma.giftCardOrder.deleteMany({ where: { user_id: buyerId } });
  await prisma.session.deleteMany({ where: { user_id: buyerId } });
  await prisma.userActivationToken.deleteMany({ where: { user_id: buyerId } });
  await prisma.user.deleteMany({ where: { id: buyerId } });
  await prisma.$disconnect();
});

test("anonymous buyers cannot list or start purchases", async () => {
  expect((await fetch(endpoint())).status).toBe(401);
  expect(
    (
      await fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: "sandbox-brl-25",
          idempotency_key: randomUUID(),
        }),
      })
    ).status,
  ).toBe(401);
});

test("account activation is required", async () => {
  const user = await orchestrator.createUser();
  const session = await orchestrator.createSession(user.id);
  try {
    expect(
      (
        await fetch(endpoint(), {
          headers: { Cookie: `session_id=${session.token}` },
        })
      ).status,
    ).toBe(403);
  } finally {
    await prisma.session.deleteMany({ where: { user_id: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("list and detail expose only the buyer's safe projection with no-store caching", async () => {
  const response = await fetch(endpoint(), { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.products[0]).toMatchObject({
    amount_minor: 2500,
    currency: "BRL",
  });
  expect(body.orders.find((order) => order.id === orderId)).toMatchObject({
    status: "CHECKOUT_PENDING",
  });
  expect(body.orders[0]).not.toHaveProperty("stripe_payment_intent_id");
  expect(body.orders[0]).not.toHaveProperty("user_id");
  expect(
    (await fetch(`${endpoint()}/${orderId}`, { headers: { Cookie: cookie } }))
      .status,
  ).toBe(200);
});

test("success and cancel query parameters cannot confirm a payment or deliver a code", async () => {
  const response = await fetch(
    `${endpoint()}/${orderId}?checkout=returned&payment_status=paid`,
    { headers: { Cookie: cookie } },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "CHECKOUT_PENDING",
    paid_at: null,
  });
});

test("server rejects client-supplied price and product manipulation", async () => {
  for (const fields of [
    { amount_minor: 1 },
    { currency: "USD" },
    { price: 1 },
  ]) {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        product_code: "sandbox-brl-25",
        idempotency_key: randomUUID(),
        ...fields,
      }),
    });
    expect(response.status).toBe(400);
  }
  const unknown = await fetch(endpoint(), {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      product_code: "unknown",
      idempotency_key: randomUUID(),
    }),
  });
  expect(unknown.status).toBe(400);
});

test("another buyer cannot read, resume, cancel or retry delivery", async () => {
  const other = await orchestrator.createUser();
  await orchestrator.activateUser(other.id);
  const session = await orchestrator.createSession(other.id);
  const headers = {
    Cookie: `session_id=${session.token}`,
    "Content-Type": "application/json",
  };
  try {
    expect((await fetch(`${endpoint()}/${orderId}`, { headers })).status).toBe(
      404,
    );
    for (const action of [
      "checkout",
      "cancel",
      "retry_issuance",
      "reconcile_payment",
    ]) {
      expect(
        (
          await fetch(`${endpoint()}/${orderId}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ action }),
          })
        ).status,
      ).toBe(404);
    }
  } finally {
    await prisma.session.deleteMany({ where: { user_id: other.id } });
    await prisma.userActivationToken.deleteMany({
      where: { user_id: other.id },
    });
    await prisma.user.delete({ where: { id: other.id } });
  }
});

test("invalid order IDs and unsolicited webhook requests are rejected", async () => {
  expect(
    (await fetch(`${endpoint()}/invalid`, { headers: { Cookie: cookie } }))
      .status,
  ).toBe(400);
  expect(
    (
      await fetch(`${webserver.getOrigin()}/api/v1/webhooks/stripe`, {
        method: "POST",
        body: "{}",
      })
    ).status,
  ).toBe(400);
});
