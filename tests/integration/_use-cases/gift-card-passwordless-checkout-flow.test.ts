import { randomUUID } from "node:crypto";
import type { NextApiHandler } from "next";
import type { BuyerCheckout } from "contracts/purchase-orders";
import { prisma } from "infra/database";
import email from "infra/email";
import { ServiceError } from "infra/errors";
import webserver from "infra/webserver";
import purchaseOrders from "models/purchase_order";
import { recordVerifiedAccountEmail } from "models/user_email_verification";
import requestCheckoutEmail from "pages/api/v1/checkout/gift-card/email";
import resendCheckoutEmail from "pages/api/v1/checkout/gift-card/resend";
import verifyCheckoutEmail from "pages/api/v1/checkout/gift-card/verify";
import orderDetails from "pages/api/v1/orders/[id]";
import confirmRecipient from "pages/api/v1/orders/[id]/recipient";
import orderHandler from "pages/api/v1/orders";
import { apiRequest } from "tests/fixtures/api_request";
import orchestrator from "tests/orchestrator";

const originalEnvironment = { ...process.env };
const addresses = new Set<string>();
const products = new Set<string>();
const checkoutCookie = "gift_card_checkout";
let productCode: string;
let sendEmail: jest.SpiedFunction<typeof email.send>;
let isolatedDatabase = false;

type Challenge = {
  challenge_id: string;
  retry_after: number;
  masked_email: string;
};
type Verified = { checkout_url: string };

beforeAll(async () => {
  const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (
    !localHosts.includes(process.env.POSTGRES_HOST ?? "") ||
    !localHosts.includes(process.env.EMAIL_HTTP_HOST ?? "") ||
    !localHosts.includes(new URL(webserver.getOrigin()).hostname)
  )
    throw new Error("This checkout test requires isolated local services.");
  await orchestrator.waitForAllServices();
  isolatedDatabase = true;
});

beforeEach(async () => {
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "stripe",
    PAYMENT_ENVIRONMENT: "sandbox",
    STRIPE_SECRET_KEY: "sk_test_synthetic_checkout",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic_checkout",
    GIFT_CARD_PROVIDER: "api",
    GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED: "false",
    GIFT_CARD_PROVIDER_BASE_URL: "https://supplier.example.test",
    GIFT_CARD_PROVIDER_USERNAME: "synthetic-user",
    GIFT_CARD_PROVIDER_PASSWORD: "synthetic-password",
    GIFT_CARD_PROVIDER_API_TOKEN: "synthetic-api-token",
    GIFT_CARD_PROVIDER_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_CONTRACT_VERIFIED: "true",
    GIFT_CARD_PROVIDER_RESPONSE_MAPPING: JSON.stringify({
      products_path: "items",
      sku: "id",
      name: "label",
      face_value: "credit",
      fixed_currency: "BRL",
      value_unit: "major",
      reference: "reference",
      status: "state",
    }),
    GIFT_CARD_RECIPIENT_ENCRYPTION_KEY: "a".repeat(64),
  });
  sendEmail = jest.spyOn(email, "send").mockResolvedValue(undefined);
  productCode = `email-checkout-${randomUUID()}`;
  products.add(productCode);
  await prisma.giftCardProduct.create({
    data: {
      code: productCode,
      provider_sku: `synthetic-sku-${randomUUID()}`,
      name: "Synthetic email gift card",
      amount_minor: 2500,
      currency: "BRL",
      enabled: true,
      available: true,
      synced_at: new Date(),
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...originalEnvironment };
});

afterAll(async () => {
  if (!isolatedDatabase) return;
  const users = await prisma.user.findMany({
    where: { email: { in: [...addresses] } },
    select: { id: true },
  });
  const buyerIds = users.map(({ id }) => id);
  await prisma.$transaction([
    prisma.giftCardCheckoutChallenge.deleteMany({
      where: { email: { in: [...addresses] } },
    }),
    prisma.purchaseOrder.deleteMany({ where: { user_id: { in: buyerIds } } }),
    prisma.giftCardOrder.deleteMany({ where: { user_id: { in: buyerIds } } }),
    prisma.userEmailVerification.deleteMany({
      where: { user_id: { in: buyerIds } },
    }),
    prisma.userActivationToken.deleteMany({
      where: { user_id: { in: buyerIds } },
    }),
    prisma.session.deleteMany({ where: { user_id: { in: buyerIds } } }),
    prisma.user.deleteMany({ where: { id: { in: buyerIds } } }),
    prisma.giftCardProduct.deleteMany({
      where: { code: { in: [...products] } },
    }),
  ]);
  await prisma.$disconnect();
});

function newBuyer() {
  const address = `checkout-${randomUUID()}@example.test`;
  addresses.add(address);
  return {
    email: address,
    intent_id: randomUUID(),
    product_code: productCode,
  };
}

type Intent = ReturnType<typeof newBuyer>;

function browserRequest<T>(
  handler: NextApiHandler,
  url: string,
  emailAddress: string,
  body: unknown,
  browserCookie?: string,
  options: { session?: string; origin?: string } = {},
) {
  const origin = new URL(webserver.getOrigin());
  return apiRequest<T>(
    (req, res) => {
      if (browserCookie) req.cookies[checkoutCookie] = browserCookie;
      return handler(req, res);
    },
    {
      url,
      body,
      session: options.session,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `${orchestrator.createTestClientAddress(emailAddress)}::1`,
        origin: options.origin ?? origin.origin,
        host: origin.host,
      },
    },
  );
}

function getCookie(headers: Record<string, string | string[]>, name: string) {
  const cookie = [headers["set-cookie"]]
    .flat()
    .find((value) => value?.startsWith(`${name}=`));
  expect(cookie).toMatch(/; HttpOnly(?:;|$)/);
  return cookie!.slice(name.length + 1).split(";", 1)[0];
}

function requestEmail(intent: Intent, browserCookie?: string) {
  return browserRequest<Challenge>(
    requestCheckoutEmail,
    "/api/v1/checkout/gift-card/email",
    intent.email,
    intent,
    browserCookie,
  );
}

function getCodeSentTo(address: string) {
  const lastEmail = sendEmail.mock.lastCall?.[0];
  expect(lastEmail?.to).toBe(address.trim().toLowerCase());
  const code = lastEmail?.text.match(/\b[0-9]{6}\b/)?.[0];
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}

function expectMaskedChallenge(body: Challenge, address: string) {
  const normalized = address.trim().toLowerCase();
  const domain = normalized.split("@")[1];
  expect(body).toEqual({
    challenge_id: expect.any(String),
    retry_after: 45,
    masked_email: `${normalized[0]}***@${domain}`,
  });
  expect(JSON.stringify(body)).not.toContain(normalized);
}

async function requestCode(intent: Intent, browserCookie?: string) {
  const response = await requestEmail(intent, browserCookie);
  expect(response.status).toBe(202);
  expectMaskedChallenge(response.body, intent.email);
  return {
    challengeId: response.body.challenge_id,
    browserCookie: response.headers["set-cookie"]
      ? getCookie(response.headers, checkoutCookie)
      : browserCookie!,
    code: getCodeSentTo(intent.email),
    maskedEmail: response.body.masked_email,
  };
}

function resendCode(
  intent: Intent,
  challengeId: string,
  browserCookie?: string,
  session?: string,
) {
  return browserRequest<Challenge>(
    resendCheckoutEmail,
    "/api/v1/checkout/gift-card/resend",
    intent.email,
    { challenge_id: challengeId },
    browserCookie,
    { session },
  );
}

function confirmCode(
  intent: Intent,
  challengeId: string,
  code: string,
  browserCookie?: string,
  session?: string,
) {
  return browserRequest<Verified>(
    verifyCheckoutEmail,
    "/api/v1/checkout/gift-card/verify",
    intent.email,
    { challenge_id: challengeId, code },
    browserCookie,
    { session },
  );
}

async function openCheckout(url: string, session: string) {
  expect(url).toMatch(/^\/checkout\/[0-9a-f-]{36}$/);
  const id = url.split("/").at(-1)!;
  const response = await apiRequest<BuyerCheckout>(orderDetails, {
    url: `/api/v1/orders/${id}`,
    method: "GET",
    query: { id },
    session,
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("Gift card checkout with one email code", () => {
  test("a first-time buyer reaches the chosen product without a username or a charge", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    expect(
      await prisma.user.findUnique({ where: { email: intent.email } }),
    ).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const verified = await confirmCode(
      intent,
      challengeId,
      code,
      browserCookie,
    );
    expect(verified.status).toBe(201);
    expect(verified.body).toEqual({ checkout_url: expect.any(String) });
    const session = getCookie(verified.headers, "session_id");
    const buyer = await prisma.user.findUniqueOrThrow({
      where: { email: intent.email },
    });
    expect(buyer.password).toBeNull();
    expect(
      await prisma.userEmailVerification.findUnique({
        where: { user_id: buyer.id },
      }),
    ).toMatchObject({
      email: intent.email,
    });
    expect(await prisma.session.count({ where: { user_id: buyer.id } })).toBe(
      1,
    );

    const checkout = await openCheckout(verified.body.checkout_url, session);
    expect(checkout.order).toMatchObject({
      item_id: intent.product_code,
      amount_minor: 2500,
      payment_status: "UNPAID",
    });
    expect(checkout.gift_card_delivery).toMatchObject({
      email: intent.email,
      verification_required: false,
    });
    const recipient = await apiRequest<BuyerCheckout>(confirmRecipient, {
      url: `/api/v1/orders/${checkout.order.id}/recipient`,
      query: { id: checkout.order.id },
      session,
      body: { name: "Synthetic gift card buyer", confirmed: true },
    });
    expect(recipient.status).toBe(200);
    expect(recipient.body.gift_card_delivery).toMatchObject({
      email: intent.email,
      confirmed: true,
      recipient_ready: true,
      verification_required: false,
    });
    expect(recipient.body.attempt).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("an existing buyer keeps their account and gets a new order for the new intent", async () => {
    const intent = newBuyer();
    const buyer = await orchestrator.createUser({
      email: intent.email,
      password: null,
    });
    await orchestrator.activateUser(buyer.id);
    await prisma.$transaction((tx) =>
      recordVerifiedAccountEmail(tx, buyer.id, intent.email),
    );
    const oldSession = await orchestrator.createSession(buyer.id);
    const oldOrder = await apiRequest<{ checkout_url: string }>(orderHandler, {
      url: "/api/v1/orders",
      session: oldSession.token,
      body: {
        item_type: "GIFT_CARD",
        item_id: productCode,
        idempotency_key: randomUUID(),
      },
    });
    expect(oldOrder.status).toBe(201);

    const { challengeId, browserCookie, code } = await requestCode({
      ...intent,
      email: intent.email.toUpperCase(),
    });
    const verified = await confirmCode(
      intent,
      challengeId,
      code,
      browserCookie,
    );
    expect(verified.status).toBe(201);
    expect(verified.body.checkout_url).not.toBe(oldOrder.body.checkout_url);
    const session = getCookie(verified.headers, "session_id");
    expect(
      await prisma.session.findUnique({ where: { token: session } }),
    ).toMatchObject({ user_id: buyer.id });
    expect(
      await prisma.purchaseOrder.count({ where: { user_id: buyer.id } }),
    ).toBe(2);
    expect(
      await prisma.user.count({
        where: { email: { equals: intent.email, mode: "insensitive" } },
      }),
    ).toBe(1);
  });

  test("rapid repeat and response recovery keep one order and one session in the requesting browser", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    const [first, second] = await Promise.all([
      confirmCode(intent, challengeId, code, browserCookie),
      confirmCode(intent, challengeId, code, browserCookie),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body).toEqual(second.body);
    expect(getCookie(first.headers, "session_id")).toBe(
      getCookie(second.headers, "session_id"),
    );

    const differentBrowser = await confirmCode(intent, challengeId, code);
    expect(differentBrowser.status).toBe(401);
    expect(getCookie(differentBrowser.headers, "session_id")).toBe("invalid");
    const buyer = await prisma.user.findUniqueOrThrow({
      where: { email: intent.email },
    });
    expect(
      await prisma.purchaseOrder.count({ where: { user_id: buyer.id } }),
    ).toBe(1);
    expect(await prisma.session.count({ where: { user_id: buyer.id } })).toBe(
      1,
    );
  });

  test("a verified code cannot replace a different account signed in from another tab", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    const signedInIntent = newBuyer();
    const signedInBuyer = await orchestrator.createUser({
      email: signedInIntent.email,
      password: null,
    });
    await orchestrator.activateUser(signedInBuyer.id);
    const session = await orchestrator.createSession(signedInBuyer.id);

    await prisma.giftCardCheckoutChallenge.update({
      where: { id: challengeId },
      data: { created_at: new Date(Date.now() - 60 * 1000) },
    });
    const resend = await resendCode(
      intent,
      challengeId,
      browserCookie,
      session.token,
    );
    expect(resend.status).toBe(409);
    expect(resend.headers["set-cookie"]).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const response = await confirmCode(
      intent,
      challengeId,
      code,
      browserCookie,
      session.token,
    );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      name: "ConflictError",
      status_code: 409,
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(
      await prisma.user.findUnique({ where: { email: intent.email } }),
    ).toBeNull();
    expect(
      await prisma.giftCardCheckoutChallenge.findUnique({
        where: { id: challengeId },
      }),
    ).toMatchObject({ used_at: null });
    expect(
      await prisma.purchaseOrder.count({
        where: { user_id: signedInBuyer.id },
      }),
    ).toBe(0);
  });

  test("the same verified browser recovers after a transient order creation failure", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    jest
      .spyOn(purchaseOrders, "begin")
      .mockRejectedValueOnce(
        new ServiceError({ message: "Synthetic order failure for retry" }),
      );
    jest.spyOn(console, "error").mockImplementation(() => {});

    const failed = await confirmCode(intent, challengeId, code, browserCookie);
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({
      name: "ServiceError",
      status_code: 503,
    });
    const buyer = await prisma.user.findUniqueOrThrow({
      where: { email: intent.email },
    });
    const retry = await confirmCode(intent, challengeId, code, browserCookie);
    expect(retry.status).toBe(201);
    expect(
      await prisma.purchaseOrder.count({ where: { user_id: buyer.id } }),
    ).toBe(1);
    expect(await prisma.session.count({ where: { user_id: buyer.id } })).toBe(
      1,
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test("a cross-origin request sends no email and creates no challenge", async () => {
    const intent = newBuyer();
    const response = await browserRequest<Challenge>(
      requestCheckoutEmail,
      "/api/v1/checkout/gift-card/email",
      intent.email,
      intent,
      undefined,
      { origin: "https://unrelated.example.test" },
    );
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      name: "ForbiddenError",
      status_code: 403,
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(
      await prisma.giftCardCheckoutChallenge.count({
        where: { email: intent.email },
      }),
    ).toBe(0);
  });

  test("wrong and expired codes do not create an account", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    const differentCode = code === "123456" ? "654321" : "123456";
    const wrong = await confirmCode(
      intent,
      challengeId,
      differentCode,
      browserCookie,
    );
    expect(wrong.status).toBe(401);
    expect(wrong.body).toMatchObject({
      name: "UnauthorizedError",
      status_code: 401,
    });
    expect(
      await prisma.giftCardCheckoutChallenge.findUnique({
        where: { id: challengeId },
      }),
    ).toMatchObject({ attempts: 1, used_at: null });

    await prisma.giftCardCheckoutChallenge.update({
      where: { id: challengeId },
      data: { expires_at: new Date(0) },
    });
    const expired = await confirmCode(intent, challengeId, code, browserCookie);
    expect(expired.status).toBe(401);
    expect(expired.body).toEqual(wrong.body);
    expect(
      await prisma.user.findUnique({ where: { email: intent.email } }),
    ).toBeNull();
  });

  test("resending too early leaves the original code valid", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    const resend = await resendCode(intent, challengeId, browserCookie);
    expect(resend.status).toBe(429);
    expect(Number(resend.headers["retry-after"])).toBeGreaterThan(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(
      (await confirmCode(intent, challengeId, code, browserCookie)).status,
    ).toBe(201);
  });

  test("one-tap resend replaces an expired code for the same browser and checkout", async () => {
    const intent = newBuyer();
    const first = await requestCode(intent);
    const now = Date.now();
    await prisma.giftCardCheckoutChallenge.update({
      where: { id: first.challengeId },
      data: {
        created_at: new Date(now - 11 * 60 * 1000),
        expires_at: new Date(now - 60 * 1000),
      },
    });

    const other = await requestCode(newBuyer());
    const foreign = await resendCode(
      intent,
      first.challengeId,
      other.browserCookie,
    );
    expect(foreign.status).toBe(401);
    expect(JSON.stringify(foreign.body)).not.toContain(intent.email);
    expect(sendEmail).toHaveBeenCalledTimes(2);

    const resent = await resendCode(
      intent,
      first.challengeId,
      first.browserCookie,
    );
    expect(resent.status).toBe(202);
    expectMaskedChallenge(resent.body, intent.email);
    expect(resent.body.masked_email).toBe(first.maskedEmail);
    expect(resent.body.challenge_id).not.toBe(first.challengeId);
    expect(getCookie(resent.headers, checkoutCookie)).toBe(first.browserCookie);
    const refreshedCookie = [resent.headers["set-cookie"]]
      .flat()
      .find((value) => value?.startsWith(`${checkoutCookie}=`));
    expect(
      Number(refreshedCookie?.match(/;\s*Max-Age=(\d+)(?:;|$)/u)?.[1]),
    ).toBeGreaterThanOrEqual(30 * 60);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    const code = getCodeSentTo(intent.email);

    const outdated = await resendCode(
      intent,
      first.challengeId,
      first.browserCookie,
    );
    expect(outdated.status).toBe(401);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(
      (
        await confirmCode(
          intent,
          first.challengeId,
          first.code,
          first.browserCookie,
        )
      ).status,
    ).toBe(401);

    const activeId = resent.body.challenge_id;
    const verified = await confirmCode(
      intent,
      activeId,
      code,
      first.browserCookie,
    );
    expect(verified.status).toBe(201);
    const session = getCookie(verified.headers, "session_id");
    const checkout = await openCheckout(verified.body.checkout_url, session);
    expect(checkout.order.item_id).toBe(intent.product_code);
    expect(checkout.gift_card_delivery?.email).toBe(intent.email);
    expect(
      await prisma.purchaseOrder.findUnique({
        where: { id: checkout.order.id },
      }),
    ).toMatchObject({
      idempotency_key: intent.intent_id,
    });

    const consumed = await resendCode(intent, activeId, first.browserCookie);
    expect(consumed.status).toBe(401);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(
      await prisma.purchaseOrder.count({
        where: { item_id: intent.product_code },
      }),
    ).toBe(1);
  });

  test("changing the email keeps the product and cancels the previous challenge", async () => {
    const intent = newBuyer();
    const first = await requestCode(intent);
    const replacement = { ...intent, email: newBuyer().email };
    const second = await requestCode(replacement, first.browserCookie);
    expect(second.challengeId).not.toBe(first.challengeId);
    expect(
      (await resendCode(intent, first.challengeId, first.browserCookie)).status,
    ).toBe(401);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(
      (
        await confirmCode(
          intent,
          first.challengeId,
          first.code,
          second.browserCookie,
        )
      ).status,
    ).toBe(401);
    expect(
      await prisma.user.findUnique({ where: { email: intent.email } }),
    ).toBeNull();

    const verified = await confirmCode(
      replacement,
      second.challengeId,
      second.code,
      second.browserCookie,
    );
    expect(verified.status).toBe(201);
    const session = getCookie(verified.headers, "session_id");
    const checkout = await openCheckout(verified.body.checkout_url, session);
    expect(checkout.order.item_id).toBe(intent.product_code);
    expect(checkout.gift_card_delivery?.email).toBe(replacement.email);
  });

  test("an abandoned checkout challenge cannot send a new code", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie } = await requestCode(intent);
    const now = Date.now();
    await prisma.giftCardCheckoutChallenge.update({
      where: { id: challengeId },
      data: {
        created_at: new Date(now - 31 * 60 * 1000),
        expires_at: new Date(now - 21 * 60 * 1000),
      },
    });
    expect((await resendCode(intent, challengeId, browserCookie)).status).toBe(
      401,
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test.each(["pending", "disabled"] as const)(
    "a %s account respects its existing identity and account restrictions",
    async (state) => {
      const intent = newBuyer();
      const buyer = await orchestrator.createUser({
        email: intent.email,
        password: null,
      });
      if (state === "disabled") await orchestrator.disableUser(buyer.id);
      const { challengeId, browserCookie, code } = await requestCode(intent);
      const verified = await confirmCode(
        intent,
        challengeId,
        code,
        browserCookie,
      );
      const accounts = await prisma.user.findMany({
        where: { email: intent.email },
        select: { id: true },
      });
      expect(accounts).toEqual([{ id: buyer.id }]);
      if (state === "pending") {
        expect(verified.status).toBe(201);
        const session = getCookie(verified.headers, "session_id");
        expect(
          await prisma.session.findUnique({ where: { token: session } }),
        ).toMatchObject({ user_id: buyer.id });
        const checkout = await openCheckout(
          verified.body.checkout_url,
          session,
        );
        expect(checkout.gift_card_delivery?.verification_required).toBe(false);
      } else {
        expect(verified.status).toBe(403);
        expect(verified.headers["set-cookie"]).toBeUndefined();
        expect(
          await prisma.session.count({ where: { user_id: buyer.id } }),
        ).toBe(0);
        expect(
          await prisma.purchaseOrder.count({ where: { user_id: buyer.id } }),
        ).toBe(0);
      }
    },
  );

  test("a removed product cannot be ordered after an email code was sent", async () => {
    const intent = newBuyer();
    const { challengeId, browserCookie, code } = await requestCode(intent);
    await prisma.giftCardProduct.update({
      where: { code: productCode },
      data: { available: false },
    });

    const response = await confirmCode(
      intent,
      challengeId,
      code,
      browserCookie,
    );
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      name: "ConflictError",
      status_code: 409,
    });
    expect(response.body).not.toHaveProperty("checkout_url");
    expect(
      await prisma.purchaseOrder.count({ where: { item_id: productCode } }),
    ).toBe(0);
  });
});
