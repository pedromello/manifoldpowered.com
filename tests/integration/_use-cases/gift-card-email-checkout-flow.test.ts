import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Stripe from "stripe";
import type { NextApiRequest } from "next";
import type { BuyerCheckout, BuyerOrder } from "contracts/purchase-orders";
import { prisma } from "infra/database";
import {
  appmaxPaymentProvider,
  createAppmaxPaymentProvider,
} from "infra/payments/appmax";
import type { PaymentQuote } from "infra/payments/types";
import { stripeCheckoutGateway } from "infra/stripe_checkout";
import type { EmailGiftProvider } from "infra/gift_card_api";
import { createEmailGiftDelivery } from "models/gift_card_email_delivery";
import paymentWorker from "models/purchase_payment_jobs";
import registrationHandler from "pages/api/v1/users";
import activationHandler from "pages/api/v1/activations/[activation_id]";
import otpHandler from "pages/api/v1/otp";
import loginHandler from "pages/api/v1/otp/sessions";
import profileHandler from "pages/api/v1/users/[username]";
import catalogHandler from "pages/api/v1/gift-cards";
import orderHandler from "pages/api/v1/orders";
import detailHandler from "pages/api/v1/orders/[id]";
import recipientHandler from "pages/api/v1/orders/[id]/recipient";
import quoteHandler from "pages/api/v1/orders/[id]/quote";
import paymentHandler from "pages/api/v1/orders/[id]/payment";
import webhookHandler from "pages/api/v1/webhooks/stripe";
import giftLibraryHandler from "pages/api/v1/gift-card-orders";
import revealHandler from "pages/api/v1/gift-card-orders/[id]/reveal";
import { apiRequest } from "tests/fixtures/api_request";
import { appmaxCheckoutFixture } from "tests/fixtures/appmax_checkout";
import {
  checkoutFixture,
  paymentEvent,
} from "tests/fixtures/gift_card_checkout";

// Real registration, mailbox challenges, controllers, transactions and durable
// jobs. Payment transports and the email gift service use synthetic fixtures.
const original = { ...process.env };
const users = new Set<string>();
const registrationEmails = new Set<string>();
const products = new Set<string>();
const stripe = new Stripe("sk_test_synthetic_email_journey");
const secret = "whsec_synthetic_email_journey";
const mailOrigin = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;
const recipient = {
  name: "Delivery Recipient Fixture",
  document: "19100000000",
  confirmed: true,
};
type Buyer = { id: string; username: string; email: string; session: string };
let fixture: ReturnType<typeof checkoutFixture>;
let productCode: string;
let service: EmailGiftProvider;
let log: jest.SpyInstance;

beforeAll(async () => {
  for (const key of ["POSTGRES_HOST", "EMAIL_SMTP_HOST", "EMAIL_HTTP_HOST"])
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        process.env[key] ?? "",
      )
    )
      throw new Error(
        "This journey requires isolated local database and email services.",
      );
  expect(
    (
      await fetch(`${mailOrigin}/messages`, {
        signal: AbortSignal.timeout(5000),
      })
    ).status,
  ).toBe(200);
});

beforeEach(async () => {
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "stripe",
    PAYMENT_ENVIRONMENT: "sandbox",
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
    STRIPE_SECRET_KEY: "sk_test_synthetic_email_journey",
    STRIPE_WEBHOOK_SECRET: secret,
  });
  fixture = checkoutFixture();
  jest
    .spyOn(stripeCheckoutGateway, "create")
    .mockImplementation(fixture.gateway.create);
  jest
    .spyOn(stripeCheckoutGateway, "retrieve")
    .mockImplementation(fixture.gateway.retrieve);
  jest
    .spyOn(stripeCheckoutGateway, "expire")
    .mockImplementation(fixture.gateway.expire);
  const providerReference = `synthetic-email-${randomUUID()}`;
  service = {
    products: jest.fn(),
    submit: jest.fn().mockResolvedValue({
      status: "pending",
      reference: providerReference,
      provider_status: 1,
    }),
    track: jest.fn().mockResolvedValue({
      status: "delivered",
      reference: providerReference,
      provider_status: 3,
    }),
  };
  productCode = `email-journey-${randomUUID()}`;
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
  log = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...original };
});
afterAll(async () => {
  const cleanupUsers = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: [...users] } },
        { email: { in: [...registrationEmails] } },
      ],
    },
    select: { id: true },
  });
  const userIds = cleanupUsers.map((user) => user.id);
  const orders = await prisma.purchaseOrder.findMany({
    where: { user_id: { in: userIds } },
    select: { id: true },
  });
  const ids = orders.map((order) => order.id);
  await prisma.$transaction(async (tx) => {
    await tx.giftCardFulfillmentJob.deleteMany({
      where: { order_id: { in: ids } },
    });
    await tx.purchasePaymentJob.deleteMany({
      where: { order_id: { in: ids } },
    });
    await tx.purchasePaymentEvent.deleteMany({
      where: { order_id: { in: ids } },
    });
    await tx.purchasePaymentAttempt.deleteMany({
      where: { order_id: { in: ids } },
    });
    await tx.purchaseOrder.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.giftCardPaymentEvent.deleteMany({
      where: { order_id: { in: ids } },
    });
    await tx.libraryItem.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.giftCardOrder.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.userEmailVerification.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await tx.userOtp.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.userActivationToken.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await tx.session.deleteMany({ where: { user_id: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.giftCardProduct.deleteMany({
      where: { code: { in: [...products] } },
    });
  });
  await prisma.$disconnect();
});

async function mailbox(address: string, subject: string) {
  const response = await fetch(`${mailOrigin}/messages`);
  expect(response.status).toBe(200);
  const messages = (await response.json()) as {
    id: number;
    recipients: string[];
    subject: string;
  }[];
  const message = messages
    .filter(
      (item) =>
        item.recipients.includes(`<${address}>`) && item.subject === subject,
    )
    .sort((a, b) => b.id - a.id)[0];
  expect(message).toBeDefined();
  const content = await fetch(`${mailOrigin}/messages/${message.id}.plain`);
  expect(content.status).toBe(200);
  return content.text();
}
async function login(email: string, username: string) {
  expect(
    (
      await apiRequest(otpHandler, {
        url: "/api/v1/otp",
        body: { login: email },
      })
    ).status,
  ).toBe(201);
  const mail = await mailbox(email, "Your Manifold login code");
  const code = mail.match(/^\d{6}$/m)?.[0];
  expect(code).toMatch(/^\d{6}$/);
  const response = await apiRequest<{ token: string; user_id: string }>(
    loginHandler,
    {
      url: "/api/v1/otp/sessions",
      body: { login: email, code },
      headers: {
        "x-forwarded-for": `2001:db8:${username.slice(-8, -4)}:${username.slice(-4)}::1`,
      },
    },
  );
  expect(response.status).toBe(201);
  return response.body.token;
}
async function register(): Promise<Buyer> {
  const username = `email_flow_${randomUUID().slice(0, 8)}`;
  const email = `${randomUUID()}@example.test`;
  registrationEmails.add(email);
  const response = await apiRequest<{ id: string; features: string[] }>(
    registrationHandler,
    { url: "/api/v1/users", body: { username, email, password: null } },
  );
  expect(response.status).toBe(201);
  users.add(response.body.id);
  expect(response.body.features).toEqual(["read:activation_token"]);
  const mail = await mailbox(
    email,
    "One step away — activate your Manifold account",
  );
  const activation_id = mail.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )?.[0];
  expect(activation_id).toBeDefined();
  expect(
    (
      await apiRequest(activationHandler, {
        url: `/api/v1/activations/${activation_id}`,
        method: "PATCH",
        query: { activation_id },
      })
    ).status,
  ).toBe(200);
  expect(
    await prisma.userEmailVerification.findUniqueOrThrow({
      where: { user_id: response.body.id },
    }),
  ).toMatchObject({ email });
  const session = await login(email, username);
  return { id: response.body.id, username, email, session };
}
async function begin(buyer: Buyer) {
  const catalog = await apiRequest<{
    products: { code: string; amount_minor: number }[];
  }>(catalogHandler, { url: "/api/v1/gift-cards", method: "GET" });
  expect(catalog.status).toBe(200);
  expect(catalog.body.products).toContainEqual(
    expect.objectContaining({ code: productCode, amount_minor: 2500 }),
  );
  const response = await apiRequest<{ id: string; checkout_url: string }>(
    orderHandler,
    {
      url: "/api/v1/orders",
      session: buyer.session,
      body: {
        item_type: "GIFT_CARD",
        item_id: productCode,
        idempotency_key: randomUUID(),
      },
    },
  );
  expect(response.status).toBe(201);
  expect(response.body.checkout_url).toBe(`/checkout/${response.body.id}`);
  return response.body.id;
}
async function confirm(buyer: Buyer, id: string, body: unknown = recipient) {
  return apiRequest<BuyerCheckout>(recipientHandler, {
    url: `/api/v1/orders/${id}/recipient`,
    query: { id },
    session: buyer.session,
    body,
  });
}
async function quote(buyer: Buyer, id: string) {
  const response = await apiRequest<BuyerCheckout>(quoteHandler, {
    url: `/api/v1/orders/${id}/quote`,
    query: { id },
    session: buyer.session,
    body: { method: "card", installments: 1, idempotency_key: randomUUID() },
  });
  expect(response.status).toBe(200);
  return response.body.attempt!;
}
async function pay(
  buyer: Buyer,
  id: string,
  attempt: NonNullable<BuyerCheckout["attempt"]>,
) {
  return apiRequest<BuyerCheckout>(paymentHandler, {
    url: `/api/v1/orders/${id}/payment`,
    query: { id },
    session: buyer.session,
    body: { attempt_id: attempt.id, expected_total_minor: attempt.total_minor },
  });
}
async function detail(buyer: Buyer, id: string) {
  return apiRequest<BuyerCheckout>(detailHandler, {
    url: `/api/v1/orders/${id}`,
    method: "GET",
    query: { id },
    session: buyer.session,
  });
}
async function notify(id: string) {
  const raw = JSON.stringify(paymentEvent(fixture.pay(id)));
  return apiRequest(
    (req, res) =>
      webhookHandler(
        Object.assign(Readable.from([raw]), {
          method: req.method,
          headers: req.headers,
          url: req.url,
        }) as NextApiRequest,
        res,
      ),
    {
      url: "/api/v1/webhooks/stripe",
      headers: {
        "stripe-signature": stripe.webhooks.generateTestHeaderString({
          payload: raw,
          secret,
        }),
      },
    },
  );
}
function privateMaterialAbsent(value: unknown) {
  const output = JSON.stringify(value);
  expect(output).not.toMatch(/gift_card_code|recipient_data/);
  expect(output).not.toContain(recipient.name);
  expect(output).not.toContain(recipient.document);
}

function directAppmaxFixture() {
  const appmax = appmaxCheckoutFixture();
  jest.replaceProperty(appmaxPaymentProvider, "capabilities", {
    methods: ["pix", "card"],
    installments: true,
    hosted: false,
  });
  return appmax;
}

test("a new catalog purchase opens Appmax while My orders resumes the earlier checkout", async () => {
  const buyer = await register();
  const earlierId = await begin(buyer);
  expect((await confirm(buyer, earlierId)).status).toBe(200);
  const earlierAttempt = await quote(buyer, earlierId);

  Object.assign(process.env, {
    PAYMENT_PROVIDER: "appmax",
    APPMAX_CLIENT_ID: "synthetic-use-case-client",
    APPMAX_CLIENT_SECRET: "synthetic-use-case-secret",
    APPMAX_AUTH_URL: "https://auth.sandboxappmax.com.br/oauth2/token",
    APPMAX_API_URL: "https://api.sandboxappmax.com.br",
  });
  const appmax = directAppmaxFixture();
  jest
    .spyOn(appmaxPaymentProvider, "quotes")
    .mockImplementation(appmax.provider.quotes);
  const scope = { provider: "appmax", environment: "sandbox" };
  const existingInstallation = await prisma.paymentInstallation.findUnique({
    where: { provider_environment: scope },
  });
  const installation =
    existingInstallation ??
    (await prisma.paymentInstallation.create({
      data: { ...scope, external_id: randomUUID() },
    }));
  try {
    const newId = await begin(buyer);
    expect(newId).not.toBe(earlierId);
    const freshCheckout = await detail(buyer, newId);
    expect(freshCheckout.status).toBe(200);
    expect(freshCheckout.body.order).toMatchObject({
      id: newId,
      item_id: productCode,
      payment_status: "UNPAID",
      can_pay: true,
    });
    expect(freshCheckout.body.attempt).toBeNull();
    expect(freshCheckout.body.gift_card_delivery).toMatchObject({
      channel: "EMAIL",
      confirmed: false,
      recipient_ready: false,
    });
    const { external_id: externalId, ...checkout } =
      freshCheckout.body.checkout;
    expect(Boolean(externalId) && externalId === installation.external_id).toBe(
      true,
    );
    expect(checkout).toEqual({
      available: true,
      hosted: false,
      methods: ["pix", "card"],
      installments: true,
      script_url: "https://scripts.sandboxappmax.com.br/appmax.min.js",
    });

    const options = await apiRequest<{ options: PaymentQuote[] }>(
      quoteHandler,
      {
        url: `/api/v1/orders/${newId}/quote`,
        method: "GET",
        query: { id: newId },
        session: buyer.session,
      },
    );
    expect(options.status).toBe(200);
    expect(options.body.options).toEqual([
      { installments: 1, total_minor: 2500, interest_minor: 0 },
      { installments: 3, total_minor: 2800, interest_minor: 300 },
    ]);
    expect(appmax.request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://auth.sandboxappmax.com.br/oauth2/token",
      "https://api.sandboxappmax.com.br/v1/payments/installments",
    ]);

    const history = await apiRequest<{ orders: BuyerOrder[] }>(orderHandler, {
      url: "/api/v1/orders",
      method: "GET",
      session: buyer.session,
    });
    expect(history.status).toBe(200);
    expect(history.body.orders).toHaveLength(2);
    expect(history.body.orders).toEqual(
      expect.arrayContaining(
        [earlierId, newId].map((id) =>
          expect.objectContaining({
            id,
            item_id: productCode,
            payment_status: "UNPAID",
            can_pay: true,
          }),
        ),
      ),
    );
    const earlierOrder = history.body.orders.find(
      ({ id }) => id === earlierId,
    )!;
    const resumed = await detail(buyer, earlierOrder.id);
    expect(resumed.status).toBe(200);
    expect(resumed.body.order.id).toBe(earlierId);
    expect(resumed.body.attempt?.id).toBe(earlierAttempt.id);
    expect(resumed.body.checkout).toMatchObject({
      available: true,
      hosted: true,
      methods: ["card"],
    });
    expect(resumed.body.gift_card_delivery?.recipient_ready).toBe(true);
    expect(fixture.gateway.create).not.toHaveBeenCalled();
    expect(service.submit).not.toHaveBeenCalled();
  } finally {
    if (!existingInstallation)
      await prisma.paymentInstallation.delete({
        where: { id: installation.id },
      });
  }
});

test.each(["pix", "card"] as const)(
  "Appmax %s reconciles payment before sending the email gift",
  async (method) => {
    Object.assign(process.env, {
      PAYMENT_PROVIDER: "appmax",
      APPMAX_MERCHANT_CLIENT_ID: "synthetic-use-case-client",
      APPMAX_MERCHANT_CLIENT_SECRET: "synthetic-use-case-secret",
      APPMAX_AUTH_URL: "https://auth.sandboxappmax.com.br/oauth2/token",
      APPMAX_API_URL: "https://api.sandboxappmax.com.br",
      GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED: "true",
    });
    const appmax = directAppmaxFixture();
    jest
      .spyOn(appmaxPaymentProvider, "quote")
      .mockImplementation(appmax.provider.quote);
    jest
      .spyOn(appmaxPaymentProvider, "createCustomer")
      .mockImplementation(appmax.provider.createCustomer);
    jest
      .spyOn(appmaxPaymentProvider, "createOrder")
      .mockImplementation(appmax.provider.createOrder);
    jest
      .spyOn(appmaxPaymentProvider, "pay")
      .mockImplementation(appmax.provider.pay);
    jest
      .spyOn(appmaxPaymentProvider, "retrieve")
      .mockImplementation(appmax.provider.retrieve);

    const buyer = await register();
    const id = await begin(buyer);
    const recipientParts = {
      first_name: "Delivery",
      last_name: "Recipient Fixture",
    };
    const confirmation = await confirm(buyer, id, {
      ...recipientParts,
      document: recipient.document,
      confirmed: true,
    });
    const expectedPrefill = {
      recipient_first_name: recipientParts.first_name,
      recipient_last_name: recipientParts.last_name,
    };
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.gift_card_delivery).toMatchObject(expectedPrefill);
    expect((await detail(buyer, id)).body.gift_card_delivery).toMatchObject(
      expectedPrefill,
    );
    const offered = await apiRequest<BuyerCheckout>(quoteHandler, {
      url: `/api/v1/orders/${id}/quote`,
      query: { id },
      session: buyer.session,
      body: {
        method,
        installments: method === "pix" ? 1 : 3,
        idempotency_key: randomUUID(),
      },
    });
    expect(offered.status).toBe(200);
    const attempt = offered.body.attempt!;
    expect(attempt.total_minor).toBe(method === "pix" ? 2500 : 2800);
    const alternateDocument = "11122233344";
    const paymentBuyer = {
      ...(method === "pix"
        ? recipientParts
        : { first_name: "Sandbox", last_name: "Buyer" }),
      phone: "11999999999",
      ip: "192.0.2.1",
    };
    const input = {
      attempt_id: attempt.id,
      expected_total_minor: attempt.total_minor,
      ...(method === "card" ? { card_token: "synthetic-card-token" } : {}),
      buyer: {
        ...paymentBuyer,
        ...(method === "pix"
          ? { reuse_recipient_document: true }
          : { document_number: alternateDocument }),
      },
    };
    const submitPayment = (body: unknown = input) =>
      apiRequest<BuyerCheckout>(paymentHandler, {
        url: `/api/v1/orders/${id}/payment`,
        query: { id },
        session: buyer.session,
        body,
      });
    if (method === "card") {
      const rejected = await submitPayment({
        ...input,
        buyer: { ...paymentBuyer, reuse_recipient_document: true },
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body).toMatchObject({
        name: "ValidationError",
        message: "Please check your payment document.",
        action: "Enter the CPF or CNPJ of the person paying.",
        status_code: 400,
      });
      expect(appmaxPaymentProvider.createCustomer).not.toHaveBeenCalled();
    }
    const payment = await submitPayment();
    expect(payment.status).toBe(200);
    expect(["PENDING", "PROCESSING"]).toContain(
      payment.body.order.payment_status,
    );
    expect((await submitPayment()).status).toBe(200);
    expect(appmaxPaymentProvider.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        ...paymentBuyer,
        document_number:
          method === "pix" ? recipient.document : alternateDocument,
      }),
    );
    const paymentPath = `/v1/payments/${method === "pix" ? "pix" : "credit-card"}`;
    const paymentRequests = appmax.request.mock.calls.filter(
      ([url]) => new URL(String(url)).pathname === paymentPath,
    );
    expect(paymentRequests).toHaveLength(1);
    expect(
      JSON.parse(String(paymentRequests[0][1]?.body)).payment_data,
    ).toMatchObject(
      method === "pix"
        ? { pix: { document_number: recipient.document } }
        : {
            credit_card: {
              holder_document_number: alternateDocument,
              installments: 3,
            },
          },
    );
    const checkout = await detail(buyer, id);
    privateMaterialAbsent(checkout.body);
    expect(checkout.body.gift_card_delivery).not.toHaveProperty(
      "recipient_first_name",
    );
    expect(checkout.body.gift_card_delivery).not.toHaveProperty(
      "recipient_last_name",
    );
    expect(JSON.stringify(checkout.body)).not.toContain(alternateDocument);
    expect(service.submit).not.toHaveBeenCalled();
    expect(
      await prisma.giftCardFulfillmentJob.findUnique({
        where: { order_id: id },
      }),
    ).toBeNull();

    const { remote_order_id } =
      await prisma.purchasePaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      });
    expect(remote_order_id).not.toBeNull();
    appmax.approve(remote_order_id!);
    await expect(paymentWorker.runOneDetailed(id)).resolves.toEqual({
      processed: true,
      error_code: null,
      provider_error: null,
    });
    expect(
      appmax.request.mock.calls.filter(
        ([url, init]) =>
          init?.method === "GET" &&
          new URL(String(url)).pathname === `/v1/orders/${remote_order_id}`,
      ),
    ).toHaveLength(method === "pix" ? 1 : 2);
    expect((await detail(buyer, id)).body.order).toMatchObject({
      payment_status: "PAID",
      delivery_status: "PENDING",
    });
    expect(
      await prisma.giftCardFulfillmentJob.findUnique({
        where: { order_id: id },
      }),
    ).not.toBeNull();
    expect(service.submit).not.toHaveBeenCalled();

    const delivery = createEmailGiftDelivery({ getProvider: () => service });
    await expect(delivery.runOne("submit", { order_id: id })).resolves.toBe(
      true,
    );
    await expect(delivery.runOne("submit", { order_id: id })).resolves.toBe(
      false,
    );
    expect(service.submit).toHaveBeenCalledTimes(1);
    expect(service.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: id,
        amount_minor: 2500,
        recipient: {
          name: recipient.name,
          document: recipient.document,
          email: buyer.email,
        },
      }),
    );
    expect(
      await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      provider_reference: expect.stringMatching(/^synthetic-email-/),
      last_error: null,
    });
    expect((await detail(buyer, id)).body.order).toMatchObject({
      payment_status: "PAID",
      gift_card_delivery: { channel: "EMAIL", status: "PROCESSING" },
    });
    await expect(
      delivery.runOne("track", { order_id: id, force: true }),
    ).resolves.toBe(true);
    expect(service.track).toHaveBeenCalledWith(id);
    expect((await detail(buyer, id)).body.order).toMatchObject({
      payment_status: "PAID",
      delivery_status: "READY",
      gift_card_delivery: { channel: "EMAIL", status: "DELIVERED" },
    });
  },
);

test.each([
  ["Pix", "pix", 2500],
  ["card", "creditcard", 2500],
  ["an incorrect amount", "pix", 2400],
] as const)(
  "Appmax payment link reconciles %s before email fulfillment",
  async (_, method, paidAmount) => {
    Object.assign(process.env, {
      PAYMENT_PROVIDER: "appmax",
      APPMAX_MERCHANT_CLIENT_ID: "synthetic-use-case-client",
      APPMAX_MERCHANT_CLIENT_SECRET: "synthetic-use-case-secret",
      APPMAX_AUTH_URL: "https://auth.sandboxappmax.com.br/oauth2/token",
      APPMAX_API_URL: "https://api.sandboxappmax.com.br",
      GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED: "true",
    });
    const linkId = Number.parseInt(randomUUID().slice(0, 7), 16) + 1;
    const childId = linkId + 1;
    const declinedId = linkId + 2;
    const checkoutUrl =
      "https://checkout.sandboxappmax.com.br/pl/synthetic-email";
    let settled = false;
    const request = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.href === "https://auth.sandboxappmax.com.br/oauth2/token")
          return Response.json({
            access_token: "synthetic-link-bearer",
            expires_in: 3600,
          });
        if (
          url.origin !== "https://api.sandboxappmax.com.br" ||
          new Headers(init?.headers).get("authorization") !==
            "Bearer synthetic-link-bearer"
        )
          throw new Error("Unexpected Appmax payment link fixture request.");
        if (url.pathname === "/v1/payment-link" && init?.method === "POST")
          return Response.json(
            { data: { id: linkId, checkout_url: checkoutUrl } },
            { status: 201 },
          );
        if (url.pathname === `/v1/payment-link/${linkId}/orders`) {
          const orders = [{ id: declinedId, status: "cancelado", total: 2500 }];
          if (settled)
            orders.push({ id: childId, status: "aprovado", total: 2500 });
          return Response.json({
            data: orders.map((order) => ({ order })),
            meta: { page: 1, total_pages: 1 },
          });
        }
        if (url.pathname === `/v1/orders/${childId}` && settled)
          return Response.json({
            data: {
              order: {
                id: childId,
                status: "aprovado",
                total_paid: paidAmount,
                payment_link_id: linkId,
                currency: "BRL",
              },
              customer: { id: 789 },
              payment: {
                method,
                installments: 1,
                paid_at: new Date().toISOString(),
              },
            },
          });
        throw new Error("Unexpected Appmax payment link fixture endpoint.");
      },
    );
    const provider = createAppmaxPaymentProvider({ request });
    jest
      .spyOn(appmaxPaymentProvider, "quote")
      .mockImplementation(provider.quote);
    jest
      .spyOn(appmaxPaymentProvider, "quotes")
      .mockImplementation(provider.quotes);
    jest
      .spyOn(appmaxPaymentProvider, "createCustomer")
      .mockImplementation(provider.createCustomer);
    jest
      .spyOn(appmaxPaymentProvider, "createOrder")
      .mockImplementation(provider.createOrder);
    jest.spyOn(appmaxPaymentProvider, "pay").mockImplementation(provider.pay);
    jest
      .spyOn(appmaxPaymentProvider, "retrieve")
      .mockImplementation(provider.retrieve);

    const buyer = await register();
    const id = await begin(buyer);
    const offer = () =>
      apiRequest<BuyerCheckout>(quoteHandler, {
        url: `/api/v1/orders/${id}/quote`,
        query: { id },
        session: buyer.session,
        body: {
          method: "link",
          installments: 1,
          idempotency_key: randomUUID(),
        },
      });
    const confirmed = await confirm(buyer, id, {
      first_name: "Delivery",
      last_name: "Recipient Fixture",
      document: recipient.document,
      confirmed: true,
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.checkout).toMatchObject({
      available: true,
      hosted: true,
      payment_link: true,
      methods: ["link"],
      installments: false,
    });
    expect(confirmed.body.checkout.script_url).toBeFalsy();
    expect(confirmed.body.gift_card_delivery).not.toHaveProperty(
      "recipient_first_name",
    );
    const quoted = await offer();
    expect(quoted.status).toBe(200);
    const attempt = quoted.body.attempt!;
    expect(attempt).toMatchObject({ method: "link", total_minor: 2500 });
    const opened = await pay(buyer, id, attempt);
    expect(opened.status).toBe(200);
    expect(opened.body.order.payment_status).toBe("PENDING");
    expect(opened.body.attempt?.checkout_url).toBe(checkoutUrl);
    privateMaterialAbsent(opened.body);
    const repeated = await pay(buyer, id, attempt);
    expect(repeated.status).toBe(200);
    expect(repeated.body.attempt?.checkout_url).toBe(checkoutUrl);
    expect((await detail(buyer, id)).body.attempt?.checkout_url).toBe(
      checkoutUrl,
    );
    expect((await offer()).status).toBe(409);
    const library = await apiRequest<{
      orders: Array<{ id: string; can_cancel?: boolean }>;
    }>(giftLibraryHandler, {
      url: "/api/v1/gift-card-orders",
      method: "GET",
      session: buyer.session,
    });
    expect(library.status).toBe(200);
    expect(library.body.orders).toContainEqual(
      expect.objectContaining({
        id: opened.body.order.gift_card_order_id,
        can_cancel: false,
      }),
    );
    const created = request.mock.calls.filter(
      ([url]) => new URL(String(url)).pathname === "/v1/payment-link",
    );
    expect(created).toHaveLength(1);
    expect(JSON.parse(String(created[0][1]?.body))).toEqual({
      name: "Synthetic email gift card",
      description: "Synthetic email gift card",
      value: 2500,
      product_type: "digital",
      payments: [["pix", "creditcard"]],
      max_installments: 1,
      fee_transfer_from_installment: 0,
      allow_multiple_sales: false,
    });
    expect(appmaxPaymentProvider.createCustomer).not.toHaveBeenCalled();
    expect(appmaxPaymentProvider.createOrder).not.toHaveBeenCalled();

    await expect(paymentWorker.runOneDetailed(id)).resolves.toMatchObject({
      processed: true,
      error_code: null,
    });
    expect((await detail(buyer, id)).body.order.payment_status).toBe("PENDING");
    expect(
      await prisma.purchasePaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({
      remote_order_id: `link:${linkId}`,
      remote_payment_id: null,
    });
    expect(
      await prisma.giftCardFulfillmentJob.findUnique({
        where: { order_id: id },
      }),
    ).toBeNull();

    settled = true;
    const recheck = await apiRequest<BuyerCheckout>(detailHandler, {
      url: `/api/v1/orders/${id}`,
      query: { id },
      session: buyer.session,
      body: { action: "reconcile" },
    });
    expect(recheck.status).toBe(200);
    const final = recheck.body;
    if (paidAmount !== 2500) {
      expect(final.order.payment_status).not.toBe("PAID");
      expect(
        await prisma.giftCardFulfillmentJob.findUnique({
          where: { order_id: id },
        }),
      ).toBeNull();
      expect(service.submit).not.toHaveBeenCalled();
      return;
    }

    expect(final.order).toMatchObject({
      payment_status: "PAID",
      delivery_status: "PENDING",
    });
    expect(
      await prisma.purchasePaymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({
      remote_order_id: `link:${linkId}`,
      remote_payment_id: String(childId),
    });
    const delivery = createEmailGiftDelivery({ getProvider: () => service });
    await expect(delivery.runOne("submit", { order_id: id })).resolves.toBe(
      true,
    );
    await expect(delivery.runOne("submit", { order_id: id })).resolves.toBe(
      false,
    );
    expect(service.submit).toHaveBeenCalledTimes(1);
    expect(service.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: id,
        amount_minor: 2500,
        recipient: {
          name: recipient.name,
          document: recipient.document,
          email: buyer.email,
        },
      }),
    );
    await expect(
      delivery.runOne("track", { order_id: id, force: true }),
    ).resolves.toBe(true);
    expect((await detail(buyer, id)).body.order).toMatchObject({
      payment_status: "PAID",
      delivery_status: "READY",
    });
  },
);

test("registration through verified Stripe payment queues email delivery, then tracking completes without a code", async () => {
  const buyer = await register();
  const id = await begin(buyer);
  const confirmation = await confirm(buyer, id);
  expect(confirmation.status).toBe(200);
  expect(confirmation.body.gift_card_delivery).toMatchObject({
    channel: "EMAIL",
    email: buyer.email,
    confirmed: true,
    recipient_ready: true,
    verification_required: false,
  });
  const saved = await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } });
  expect(saved.recipient_data).toMatch(/^v1\./);
  expect(saved.recipient_data).not.toContain(recipient.name);
  const attempt = await quote(buyer, id);
  const payment = await pay(buyer, id, attempt);
  expect(payment.status).toBe(200);
  expect(payment.body.order.payment_status).toBe("PENDING");
  expect((await pay(buyer, id, attempt)).status).toBe(200);
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect((await confirm(buyer, id)).status).toBe(409);

  expect((await notify(id)).status).toBe(200);
  expect((await detail(buyer, id)).body.order.payment_status).toBe("PENDING");
  expect(service.submit).not.toHaveBeenCalled();
  await expect(paymentWorker.runOne(id)).resolves.toBe(true);
  expect(
    await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ payment_status: "PAID", delivery_status: "PENDING" });
  expect(
    await prisma.giftCardFulfillmentJob.findUnique({ where: { order_id: id } }),
  ).not.toBeNull();
  expect(service.submit).not.toHaveBeenCalled();
  const delivery = createEmailGiftDelivery({ getProvider: () => service });
  await expect(delivery.runOne("submit", { order_id: id })).resolves.toBe(true);
  expect(service.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      request_id: id,
      amount_minor: 2500,
      recipient: {
        name: recipient.name,
        document: recipient.document,
        email: buyer.email,
      },
    }),
  );
  expect((await detail(buyer, id)).body.order).toMatchObject({
    delivery_status: "PENDING",
    gift_card_delivery: { channel: "EMAIL", status: "PROCESSING" },
  });
  await expect(delivery.runOne("track", { order_id: id })).resolves.toBe(false);
  expect(service.track).not.toHaveBeenCalled();
  await prisma.$transaction([
    prisma.giftCardOrder.update({
      where: { id },
      data: { next_tracking_at: new Date(Date.now() - 1000) },
    }),
    prisma.giftCardFulfillmentJob.update({
      where: { order_id: id },
      data: { run_after: new Date(Date.now() - 1000) },
    }),
  ]);
  await expect(delivery.runOne("track", { order_id: id })).resolves.toBe(true);
  expect(service.track).toHaveBeenCalledWith(id);
  const completed = await detail(buyer, id);
  expect(completed.body.order).toMatchObject({
    payment_status: "PAID",
    delivery_status: "READY",
    gift_card_delivery: {
      channel: "EMAIL",
      email: buyer.email,
      status: "DELIVERED",
    },
  });
  const library = await apiRequest(giftLibraryHandler, {
    url: "/api/v1/gift-card-orders",
    method: "GET",
    session: buyer.session,
  });
  expect(library.status).toBe(200);
  expect(
    await prisma.libraryItem.count({
      where: { user_id: buyer.id, item_id: id, item_type: "GIFT_CARD" },
    }),
  ).toBe(1);
  expect(
    await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({
    gift_card_code: null,
    first_revealed_at: null,
    fulfillment_status: "DELIVERED",
  });
  expect(
    (
      await apiRequest(revealHandler, {
        url: `/api/v1/gift-card-orders/${id}/reveal`,
        query: { id },
        session: buyer.session,
        body: { confirm: true },
      })
    ).status,
  ).toBe(409);
  expect(await delivery.runOne("track", { order_id: id })).toBe(false);
  expect(service.submit).toHaveBeenCalledTimes(1);
  expect(service.track).toHaveBeenCalledTimes(1);
  for (const response of [confirmation, payment, completed, library])
    privateMaterialAbsent(response.body);
  expect(log).not.toHaveBeenCalled();
});

test("a replay returns its original order even after catalog withdrawal and integration disablement", async () => {
  const buyer = await register(),
    id = await begin(buyer);
  const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
  await prisma.giftCardProduct.update({
    where: { code: productCode },
    data: { enabled: false, available: false },
  });
  process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED = "false";
  const body = {
    item_type: "GIFT_CARD",
    item_id: productCode,
    idempotency_key: order.idempotency_key,
  };
  const replay = await apiRequest<{ id: string }>(orderHandler, {
    url: "/api/v1/orders",
    session: buyer.session,
    body,
  });
  expect(replay.status).toBe(201);
  expect(replay.body.id).toBe(id);
  expect(
    (
      await apiRequest(orderHandler, {
        url: "/api/v1/orders",
        session: buyer.session,
        body: { ...body, item_id: "another-product" },
      })
    ).status,
  ).toBe(409);
  expect(
    await prisma.purchaseOrder.count({ where: { user_id: buyer.id } }),
  ).toBe(1);
  expect(fixture.gateway.create).not.toHaveBeenCalled();
});

test("unreadable recipient data or disabled supplier configuration cannot start a charge", async () => {
  const buyer = await register(),
    id = await begin(buyer);
  expect((await confirm(buyer, id)).status).toBe(200);
  const attempt = await quote(buyer, id);
  const key = process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY = "22".repeat(32);
  expect(
    (await detail(buyer, id)).body.gift_card_delivery?.recipient_ready,
  ).toBe(false);
  expect((await pay(buyer, id, attempt)).status).toBe(503);
  process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY = key;
  process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED = "false";
  expect((await pay(buyer, id, attempt)).status).toBe(503);
  expect(fixture.gateway.create).not.toHaveBeenCalled();
  expect(
    await prisma.purchasePaymentAttempt.findUnique({
      where: { id: attempt.id },
      select: { submission_started_at: true },
    }),
  ).toEqual({ submission_started_at: null });
});

test("a missing recipient confirmation or required document cannot start a charge", async () => {
  const buyer = await register(),
    id = await begin(buyer);
  const attempt = await quote(buyer, id);
  expect((await pay(buyer, id, attempt)).status).toBe(409);
  expect(
    (
      await confirm(buyer, id, {
        name: recipient.name,
        confirmed: true,
        email: "another@example.test",
      })
    ).status,
  ).toBe(400);
  process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED = "true";
  expect(
    (await confirm(buyer, id, { name: recipient.name, confirmed: true }))
      .status,
  ).toBe(400);
  expect(fixture.create).not.toHaveBeenCalled();
  expect(service.submit).not.toHaveBeenCalled();
  expect(
    await prisma.purchasePaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    }),
  ).toMatchObject({ status: "UNPAID", submission_started_at: null });
});

test("another buyer and an anonymous session cannot confirm or pay for the recipient", async () => {
  const owner = await register(),
    stranger = await register(),
    id = await begin(owner);
  const attempt = await quote(owner, id);
  expect((await confirm(stranger, id)).status).toBe(404);
  expect((await pay(stranger, id, attempt)).status).toBe(404);
  expect(
    (
      await apiRequest(recipientHandler, {
        url: `/api/v1/orders/${id}/recipient`,
        query: { id },
        body: recipient,
      })
    ).status,
  ).toBe(401);
  expect(
    await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({
    recipient_confirmed_at: null,
    recipient_data: null,
    recipient_email: owner.email,
  });
  expect(fixture.create).not.toHaveBeenCalled();
});

test("a legacy session without mailbox proof cannot confirm delivery or start payment", async () => {
  const buyer = await register(),
    id = await begin(buyer);
  await prisma.userEmailVerification.delete({ where: { user_id: buyer.id } });
  expect(
    (await detail(buyer, id)).body.gift_card_delivery?.verification_required,
  ).toBe(true);
  expect((await confirm(buyer, id)).status).toBe(409);
  expect((await pay(buyer, id, await quote(buyer, id))).status).toBe(409);
  expect(fixture.create).not.toHaveBeenCalled();
  expect(service.submit).not.toHaveBeenCalled();
});

test("changing account email invalidates the confirmed recipient even after proving the new mailbox", async () => {
  const buyer = await register(),
    id = await begin(buyer);
  expect((await confirm(buyer, id)).status).toBe(200);
  const attempt = await quote(buyer, id);
  const changedEmail = `${randomUUID()}@example.test`;
  expect(
    (
      await apiRequest(profileHandler, {
        url: `/api/v1/users/${buyer.username}`,
        method: "PATCH",
        query: { username: buyer.username },
        session: buyer.session,
        body: { email: changedEmail },
      })
    ).status,
  ).toBe(200);
  expect(
    (await detail(buyer, id)).body.gift_card_delivery?.verification_required,
  ).toBe(true);
  expect((await pay(buyer, id, attempt)).status).toBe(409);
  buyer.session = await login(changedEmail, buyer.username);
  expect(
    await prisma.userEmailVerification.findUniqueOrThrow({
      where: { user_id: buyer.id },
    }),
  ).toMatchObject({ email: changedEmail });
  expect((await confirm(buyer, id)).status).toBe(409);
  expect((await pay(buyer, id, attempt)).status).toBe(409);
  expect(
    await prisma.giftCardOrder.findUniqueOrThrow({ where: { id } }),
  ).toMatchObject({ recipient_email: buyer.email });
  expect(fixture.create).not.toHaveBeenCalled();
  expect(service.submit).not.toHaveBeenCalled();
});
