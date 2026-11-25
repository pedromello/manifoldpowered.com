import { createAppmaxPaymentProvider } from "infra/payments/appmax";
import {
  PaymentLinkRejectedError,
  PaymentTransportError,
} from "infra/payments/errors";
import type { PaymentContext } from "infra/payments/types";
import {
  decodeAppmaxAppstorePaymentWebhook,
  decodeAppmaxPaymentWebhook,
} from "infra/payments/webhooks";

const checkoutUrl = "https://checkout.sandboxappmax.com.br/pl/example";
const context: PaymentContext = {
  order_id: "local-example",
  attempt_id: "attempt-example",
  product_name: "Synthetic digital product",
  product_code: "example",
  amount_minor: 2500,
  currency: "BRL",
  method: "link",
  installments: 1,
};
const reference: PaymentContext = { ...context, remote_order_id: "link:123" };
const original = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, {
    APPMAX_MERCHANT_CLIENT_ID: "synthetic-merchant-client",
    APPMAX_MERCHANT_CLIENT_SECRET: "synthetic-merchant-secret",
    PAYMENT_ENVIRONMENT: "sandbox",
  });
});
afterEach(() => {
  process.env = { ...original };
});

function providerWith(...responses: Response[]) {
  const request: jest.MockedFunction<typeof fetch> = jest.fn();
  request.mockResolvedValueOnce(
    Response.json({ access_token: "synthetic", expires_in: 3600 }),
  );
  for (const response of responses) request.mockResolvedValueOnce(response);
  return { provider: createAppmaxPaymentProvider({ request }), request };
}

function linkOrders(status: string, total = 2500) {
  return Response.json({
    data: [{ order: { id: 456, status, total } }],
    meta: { page: 1, total_pages: 1 },
  });
}

function paidOrder(
  method = "creditcard",
  link = 123,
  paidAt = "2026-11-22 12:00:00",
) {
  return Response.json({
    data: {
      order: {
        id: 456,
        status: "aprovado",
        total_paid: 2500,
        payment_link_id: link,
      },
      customer: { id: 17 },
      payment: { method, installments: 1, paid_at: paidAt },
    },
  });
}

test("creates a fixed-quantity hosted link with Pix and card at the local price", async () => {
  const { provider, request } = providerWith(
    Response.json(
      { data: { id: 123, checkout_url: checkoutUrl } },
      { status: 201 },
    ),
  );
  await expect(provider.quote(499, 1, "link")).rejects.toThrow();
  await expect(provider.quote(2500, 2, "link")).rejects.toThrow();
  await expect(provider.pay(context)).resolves.toMatchObject({
    remote_order_id: "link:123",
    method: "link",
    state: "PENDING",
    total_minor: 2500,
    checkout_url: checkoutUrl,
  });
  expect(request).toHaveBeenCalledTimes(2);
  const [url, init] = request.mock.calls[1];
  expect(url).toBe("https://api.sandboxappmax.com.br/v1/payment-link");
  expect(JSON.parse(String(init?.body))).toEqual({
    name: context.product_name,
    description: context.product_name,
    value: 2500,
    product_type: "digital",
    payments: ["pix", "creditcard"],
    max_installments: 1,
    fee_transfer_from_installment: 0,
    allow_multiple_sales: false,
  });
});

test("a canceled child checkout leaves the original link pending", async () => {
  const { provider, request } = providerWith(linkOrders("cancelado"));
  await expect(provider.pay(reference)).resolves.toMatchObject({
    remote_order_id: "link:123",
    method: "link",
    state: "PENDING",
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][1]?.method).toBe("GET");
});

test.each([
  ["creditcard", "card"],
  ["pix", "pix"],
])(
  "verifies the Appmax child order and reconciles %s",
  async (wireMethod, method) => {
    const { provider, request } = providerWith(
      linkOrders("aprovado"),
      paidOrder(wireMethod),
    );
    await expect(provider.retrieve(reference)).resolves.toMatchObject({
      remote_order_id: "link:123",
      remote_payment_id: "456",
      state: "PAID",
      method,
      total_minor: 2500,
      paid_at: new Date("2026-11-22T15:00:00.000Z"),
    });
    expect(
      request.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual([
      "/oauth2/token",
      "/v1/payment-link/123/orders",
      "/v1/orders/456",
    ]);
  },
);

test("rejects a wrong link association or amount in financial reconciliation", async () => {
  await expect(
    providerWith(
      linkOrders("aprovado"),
      paidOrder("creditcard", 99),
    ).provider.retrieve(reference),
  ).rejects.toMatchObject({ stage: "payment_link_order_identity" });
  await expect(
    providerWith(linkOrders("aprovado", 2600)).provider.retrieve(reference),
  ).rejects.toMatchObject({ stage: "payment_link_order_amount" });
});

test("requires a valid provider payment timestamp for approval", async () => {
  await expect(
    providerWith(
      linkOrders("aprovado"),
      paidOrder("creditcard", 123, "invalid"),
    ).provider.retrieve(reference),
  ).rejects.toMatchObject({ stage: "payment_date" });
});

test("distinguishes a definite API rejection from an unsafe returned checkout URL", async () => {
  const rejected = providerWith(
    Response.json({ message: "Synthetic provider response" }, { status: 422 }),
  );
  const rejection = rejected.provider.pay(context);
  await expect(rejection).rejects.toBeInstanceOf(PaymentLinkRejectedError);
  await expect(rejection).rejects.toMatchObject({
    validationCategory: "validation_without_fields",
  });
  expect(rejected.request).toHaveBeenCalledTimes(2);

  const unsafe = providerWith(
    Response.json({
      data: { id: 123, checkout_url: "https://example.test/pl/123" },
    }),
  );
  const failed = unsafe.provider.pay(context);
  await expect(failed).rejects.toBeInstanceOf(PaymentTransportError);
  await expect(failed).rejects.toMatchObject({
    stage: "payment_link_url",
  });
  expect(unsafe.request).toHaveBeenCalledTimes(2);
});

test("exposes only documented field names for Appmax link validation errors", async () => {
  const { provider, request } = providerWith(
    Response.json(
      {
        errors: {
          document: ["sensitive-provider-value"],
          message: {
            "payments.0": ["sensitive-provider-value"],
            payments: ["sensitive-provider-value"],
            "synthetic-private-key": ["sensitive-provider-value"],
          },
        },
      },
      { status: 422 },
    ),
  );
  const error: unknown = await provider
    .pay(context)
    .catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(PaymentLinkRejectedError);
  expect(error).toMatchObject({
    httpStatus: 422,
    stage: "payment_link_rejected",
    validationCategory: "field_validation",
    fields: ["document", "payments"],
  });
  expect(JSON.stringify(error)).not.toContain("sensitive-provider-value");
  expect(JSON.stringify(error)).not.toContain("synthetic-private-key");
  expect(request).toHaveBeenCalledTimes(2);
});

test("keeps Appmax payment-link notifications separate from direct order references", () => {
  const appId = "f29616d1-c7b9-4e38-8f35-aa1b1e446564";
  const token = "synthetic-appstore-webhook-token-for-tests";
  process.env.APPMAX_APPSTORE_APP_ID = appId;
  process.env.APPMAX_APPSTORE_WEBHOOK_TOKEN = token;
  expect(
    decodeAppmaxAppstorePaymentWebhook(
      {
        app_id: appId,
        site_id: "8a4c4f13-368e-4aef-9215-5d567a66ca4e",
        event: "order_paid_by_pix",
        event_type: "order",
        data: { order_id: 456, payment_link_id: 123 },
      },
      token,
    ),
  ).toBe("link:123");
  expect(
    decodeAppmaxPaymentWebhook({
      event: "OrderPaid",
      data: { id: 456, payment_link_id: "123" },
    }),
  ).toMatchObject({ remote_order_id: "link:123" });
});
