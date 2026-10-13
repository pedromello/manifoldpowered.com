import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { appmaxPaymentProvider } from "infra/payments/appmax";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";
import type { GiftCardProduct } from "infra/gift_card_provider";
import type { BuyerCheckout, BuyerOrder } from "contracts/purchase-orders";
import type { PaymentMethod, PaymentQuote } from "infra/payments/types";
import registrationHandler from "pages/api/v1/users";
import activationHandler from "pages/api/v1/activations/[activation_id]";
import otpHandler from "pages/api/v1/otp";
import loginHandler from "pages/api/v1/otp/sessions";
import profileHandler from "pages/api/v1/user";
import catalogHandler from "pages/api/v1/gift-cards";
import ordersHandler from "pages/api/v1/orders";
import detailHandler from "pages/api/v1/orders/[id]";
import quoteHandler from "pages/api/v1/orders/[id]/quote";
import paymentHandler from "pages/api/v1/orders/[id]/payment";
import webhookHandler from "pages/api/v1/webhooks/appmax/[token]";
import giftLibraryHandler from "pages/api/v1/gift-card-orders";
import revealHandler from "pages/api/v1/gift-card-orders/[id]/reveal";
import worker from "models/purchase_payment_jobs";
import orchestrator from "tests/orchestrator";
import { apiRequest } from "tests/fixtures/api_request";
import { appmaxCheckoutFixture } from "tests/fixtures/appmax_checkout";

// Real registration/auth handlers, SMTP, PostgreSQL, Appmax adapter and worker.
// HTTP request/response objects and Appmax HTTP responses are test doubles.
// Each variant registers its own user; no ready-made account or global reset.
const originalEnv = { ...process.env };
const emails: string[] = [];
let fixture: ReturnType<typeof appmaxCheckoutFixture>;
const mailOrigin = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

beforeAll(async () => {
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
  for (const name of ["POSTGRES_HOST", "EMAIL_SMTP_HOST", "EMAIL_HTTP_HOST"])
    if (!loopback.includes(process.env[name] ?? ""))
      throw new Error(
        "This use case requires local database and email services.",
      );
  const mail = await fetch(`${mailOrigin}/messages`, {
    signal: AbortSignal.timeout(5000),
  });
  expect(mail.status).toBe(200);
});

beforeEach(() => {
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "appmax",
    PAYMENT_ENVIRONMENT: "sandbox",
    APPMAX_CLIENT_ID: "synthetic-use-case-client",
    APPMAX_CLIENT_SECRET: "synthetic-use-case-secret",
    APPMAX_AUTH_URL: "https://auth.sandboxappmax.com.br/oauth2/token",
    APPMAX_API_URL: "https://api.sandboxappmax.com.br",
    APPMAX_WEBHOOK_TOKEN:
      "synthetic-use-case-webhook-token-at-least-32-characters",
  });
  fixture = appmaxCheckoutFixture();
  // Keep the production strategy resolver and use a fresh real adapter for each
  // test. Only its injected HTTP transport is synthetic.
  jest
    .spyOn(appmaxPaymentProvider, "configured")
    .mockImplementation(fixture.provider.configured);
  jest
    .spyOn(appmaxPaymentProvider, "quote")
    .mockImplementation(fixture.provider.quote);
  jest
    .spyOn(appmaxPaymentProvider, "quotes")
    .mockImplementation(fixture.provider.quotes);
  jest
    .spyOn(appmaxPaymentProvider, "createCustomer")
    .mockImplementation(fixture.provider.createCustomer);
  jest
    .spyOn(appmaxPaymentProvider, "createOrder")
    .mockImplementation(fixture.provider.createOrder);
  jest
    .spyOn(appmaxPaymentProvider, "pay")
    .mockImplementation(fixture.provider.pay);
  jest
    .spyOn(appmaxPaymentProvider, "retrieve")
    .mockImplementation(fixture.provider.retrieve);
  jest.spyOn(simulatedGiftCardProvider, "issue");
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...originalEnv };
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const orders = await prisma.purchaseOrder.findMany({
    where: { user_id: { in: userIds } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  await prisma.$transaction(async (tx) => {
    await tx.purchasePaymentJob.deleteMany({
      where: { order_id: { in: orderIds } },
    });
    await tx.purchasePaymentEvent.deleteMany({
      where: { order_id: { in: orderIds } },
    });
    await tx.purchasePaymentAttempt.deleteMany({
      where: { order_id: { in: orderIds } },
    });
    await tx.purchaseOrder.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.giftCardPaymentEvent.deleteMany({
      where: { order_id: { in: orderIds } },
    });
    await tx.libraryItem.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.giftCardOrder.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.session.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.userOtp.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.userActivationToken.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  await prisma.$disconnect();
});

async function ownEmail(address: string, subject: string) {
  const response = await fetch(`${mailOrigin}/messages`);
  expect(response.status).toBe(200);
  const messages = (await response.json()) as {
    id: number;
    recipients: string[];
    subject: string;
  }[];
  const message = messages.find(
    (item) =>
      item.recipients.includes(`<${address}>`) && item.subject === subject,
  );
  expect(message).toBeDefined();
  const content = await fetch(`${mailOrigin}/messages/${message!.id}.plain`);
  expect(content.status).toBe(200);
  return content.text();
}

async function notify(remoteId: string) {
  return apiRequest(webhookHandler, {
    url: "/api/v1/webhooks/appmax/[token]",
    query: { token: process.env.APPMAX_WEBHOOK_TOKEN! },
    body: {
      environment: "production",
      event: "OrderPaid",
      data: { id: Number(remoteId) },
    },
  });
}

function externalCalls(path: string, method: string) {
  return fixture.request.mock.calls.filter(
    ([url, init]) =>
      new URL(String(url)).pathname === path && init?.method === method,
  );
}

describe("Use case: register, buy a gift card, pay and reveal its code", () => {
  test.each<{ method: PaymentMethod; installments: number; total: number }>([
    { method: "pix", installments: 1, total: 2500 },
    { method: "card", installments: 3, total: 2800 },
  ])(
    "completes the entire journey with $method ($installments installment(s))",
    async ({ method, installments, total }) => {
      const username = `gift_flow_${randomUUID().slice(0, 8)}`;
      const email = `${randomUUID()}@example.test`;
      emails.push(email);

      // 1. Registration creates an unactivated passwordless account and sends mail.
      const registration = await apiRequest<{ id: string; features: string[] }>(
        registrationHandler,
        {
          url: "/api/v1/users",
          body: { username, email, password: null },
        },
      );
      expect(registration.status).toBe(201);
      expect(registration.body.features).toEqual(["read:activation_token"]);
      const userId = registration.body.id;
      const activationMail = await ownEmail(
        email,
        "One step away — activate your Manifold account",
      );
      const activationId = orchestrator.extractUUID(activationMail);
      expect(activationId).toBeTruthy();

      // 2. The user follows the real activation route, then signs in by emailed OTP.
      const activated = await apiRequest(activationHandler, {
        url: `/api/v1/activations/${activationId}`,
        method: "PATCH",
        query: { activation_id: activationId },
      });
      expect(activated.status).toBe(200);
      expect(activated.headers["set-cookie"]).toEqual(
        expect.stringContaining("session_id="),
      );
      expect(
        (
          await apiRequest(otpHandler, {
            url: "/api/v1/otp",
            body: { login: email },
          })
        ).status,
      ).toBe(201);
      const loginMail = await ownEmail(email, "Your Manifold login code");
      const code = orchestrator.extractOtpCode(loginMail);
      expect(code).toMatch(/^\d{6}$/);
      const login = await apiRequest<{ token: string; user_id: string }>(
        loginHandler,
        {
          url: "/api/v1/otp/sessions",
          headers: {
            "x-forwarded-for": orchestrator.createTestClientAddress(username),
          },
          body: { login: email, code },
        },
      );
      expect(login.status).toBe(201);
      expect(login.body.user_id).toBe(userId);
      const session = login.body.token;
      const profile = await apiRequest<{ id: string }>(profileHandler, {
        url: "/api/v1/user",
        method: "GET",
        session,
      });
      expect(profile.status).toBe(200);
      expect(profile.body.id).toBe(userId);

      // 3. Select from the public catalog and create an authenticated order.
      const catalog = await apiRequest<{ products: GiftCardProduct[] }>(
        catalogHandler,
        {
          url: "/api/v1/gift-cards",
          method: "GET",
        },
      );
      expect(catalog.status).toBe(200);
      const product = catalog.body.products.find(
        (item) => item.code === "sandbox-brl-25",
      )!;
      expect(product).toMatchObject({ amount_minor: 2500, currency: "BRL" });
      const purchase = await apiRequest<{ id: string; checkout_url: string }>(
        ordersHandler,
        {
          url: "/api/v1/orders",
          session,
          body: {
            item_type: "GIFT_CARD",
            item_id: product.code,
            idempotency_key: randomUUID(),
          },
        },
      );
      expect(purchase.status).toBe(201);
      const id = purchase.body.id;
      expect(purchase.body.checkout_url).toBe(`/checkout/${id}`);
      expect(
        await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        user_id: userId,
        payment_provider: "appmax",
        payment_environment: "sandbox",
        payment_status: "UNPAID",
        amount_minor: 2500,
      });

      // 4. Review server-calculated installments, interest and total before paying.
      if (method === "card") {
        const options = await apiRequest<{ options: PaymentQuote[] }>(
          quoteHandler,
          {
            url: `/api/v1/orders/${id}/quote`,
            method: "GET",
            query: { id },
            session,
          },
        );
        expect(options.status).toBe(200);
        expect(options.body.options).toContainEqual({
          installments: 3,
          total_minor: 2800,
          interest_minor: 300,
        });
      }
      const quote = await apiRequest<BuyerCheckout>(quoteHandler, {
        url: `/api/v1/orders/${id}/quote`,
        query: { id },
        session,
        body: { method, installments, idempotency_key: randomUUID() },
      });
      expect(quote.status).toBe(200);
      const attempt = quote.body.attempt!;
      expect(attempt).toMatchObject({
        method,
        installments,
        total_minor: total,
        interest_minor: total - 2500,
      });
      const paymentBody = {
        attempt_id: attempt.id,
        expected_total_minor: total,
        buyer: {
          first_name: "Synthetic",
          last_name: "Buyer",
          phone: "11999999999",
          document_number: "19100000000",
          ip: "192.0.2.1",
        },
        ...(method === "card" ? { card_token: "synthetic-card-token" } : {}),
      };

      // 5. The real adapter submits once; Pix generation/authorization is not payment.
      const payment = await apiRequest<BuyerCheckout>(paymentHandler, {
        url: `/api/v1/orders/${id}/payment`,
        query: { id },
        session,
        body: paymentBody,
      });
      expect(payment.status).toBe(200);
      expect(payment.body.order.payment_status).toBe(
        method === "pix" ? "PENDING" : "PROCESSING",
      );
      if (method === "pix")
        expect(payment.body.attempt?.pix?.emv).toBe("FIXTURE-PIX-NOT-PAYABLE");
      const duplicate = await apiRequest(paymentHandler, {
        url: `/api/v1/orders/${id}/payment`,
        query: { id },
        session,
        body: paymentBody,
      });
      expect(duplicate.status).toBe(200);
      const remoteId = (
        await prisma.purchasePaymentAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).remote_order_id!;
      expect(
        (
          await apiRequest(revealHandler, {
            url: `/api/v1/gift-card-orders/${id}/reveal`,
            query: { id },
            session,
            body: { confirm: true },
          })
        ).status,
      ).toBe(409);

      // 6. A forged "paid" signal cannot release an unconfirmed payment.
      expect((await notify(remoteId)).status).toBe(200);
      expect(await worker.runOne(id)).toBe(true);
      expect(
        await prisma.libraryItem.count({
          where: { user_id: userId, item_id: id },
        }),
      ).toBe(0);
      expect(simulatedGiftCardProvider.issue).not.toHaveBeenCalled();

      // 7. Simulate external approval, process the webhook and query the provider.
      fixture.approve(remoteId);
      expect((await notify(remoteId)).status).toBe(200);
      expect(await worker.runOne(id)).toBe(true);
      const paid = await apiRequest<BuyerCheckout>(detailHandler, {
        url: `/api/v1/orders/${id}`,
        method: "GET",
        query: { id },
        session,
      });
      expect(paid.status).toBe(200);
      expect(paid.body.order).toMatchObject({
        payment_status: "PAID",
        delivery_status: "READY",
        total_minor: total,
      });
      const history = await apiRequest<{ orders: BuyerOrder[] }>(
        ordersHandler,
        {
          url: "/api/v1/orders",
          method: "GET",
          session,
        },
      );
      expect(history.body.orders).toHaveLength(1);
      expect(history.body.orders[0]).toMatchObject({
        id,
        item_type: "GIFT_CARD",
        payment_status: "PAID",
      });
      const library = await apiRequest<{
        orders: { id: string; status: string }[];
      }>(giftLibraryHandler, {
        url: "/api/v1/gift-card-orders",
        method: "GET",
        session,
      });
      expect(library.status).toBe(200);
      expect(library.body.orders).toEqual([
        expect.objectContaining({ id, status: "FULFILLED" }),
      ]);
      for (const response of [paid, history, library]) {
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(JSON.stringify(response.body)).not.toContain("gift_card_code");
        expect(JSON.stringify(response.body)).not.toContain(
          "SIMULATED-NOT-REDEEMABLE",
        );
      }
      expect(
        (await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }))
          .first_revealed_at,
      ).toBeNull();

      // 8. Reveal only with explicit first confirmation; repeated reveals keep the date.
      const revealInput = {
        url: `/api/v1/gift-card-orders/${id}/reveal`,
        query: { id },
        session,
      };
      expect(
        (
          await apiRequest(revealHandler, {
            ...revealInput,
            body: { confirm: false },
          })
        ).status,
      ).toBe(400);
      const revealed = await apiRequest<{
        gift_card_code: string;
        first_revealed_at: string;
      }>(revealHandler, {
        ...revealInput,
        body: { confirm: true },
      });
      expect(revealed.status).toBe(200);
      expect(revealed.headers["cache-control"]).toBe("no-store");
      expect(revealed.body.gift_card_code).toContain(
        "SIMULATED-NOT-REDEEMABLE",
      );
      expect(Date.parse(revealed.body.first_revealed_at)).not.toBeNaN();
      expect(
        (
          await apiRequest(revealHandler, {
            ...revealInput,
            session: undefined,
            body: { confirm: true },
          })
        ).status,
      ).toBe(401);
      const repeated = await apiRequest<typeof revealed.body>(revealHandler, {
        ...revealInput,
        body: { confirm: true },
      });
      expect(repeated.status).toBe(200);
      expect(repeated.body).toEqual(revealed.body);

      // Replayed notifications do not charge, issue or grant access again.
      expect((await notify(remoteId)).status).toBe(200);
      expect(await worker.runOne(id)).toBe(true);
      expect(simulatedGiftCardProvider.issue).toHaveBeenCalledTimes(1);
      expect(
        await prisma.libraryItem.count({
          where: { user_id: userId, item_id: id, item_type: "GIFT_CARD" },
        }),
      ).toBe(1);
      expect(
        await prisma.purchasePaymentEvent.count({
          where: { order_id: id, payment_status: "PAID" },
        }),
      ).toBe(1);
      expect(externalCalls("/v1/customers", "POST")).toHaveLength(1);
      expect(externalCalls("/v1/orders", "POST")).toHaveLength(1);
      expect(
        externalCalls(
          `/v1/payments/${method === "pix" ? "pix" : "credit-card"}`,
          "POST",
        ),
      ).toHaveLength(1);
      const [, orderRequest] = externalCalls("/v1/orders", "POST")[0];
      expect(
        JSON.parse(String(orderRequest!.body)).products[0].unit_value,
      ).toBe(total);
      expect(
        (
          await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } })
        ).first_revealed_at!.toISOString(),
      ).toBe(revealed.body.first_revealed_at);
    },
  );
});
