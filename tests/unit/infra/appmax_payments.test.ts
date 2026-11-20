import {
  appmaxDate,
  appmaxQuotes,
  appmaxSnapshot,
  createAppmaxPaymentProvider,
} from "infra/payments/appmax";
import {
  decodeAppmaxPaymentWebhook,
  acceptsAppmaxWebhookToken,
} from "infra/payments/webhooks";
import {
  selectedPaymentProvider,
  appmaxEndpoints,
} from "infra/payments/config";
import type { PaymentContext } from "infra/payments/types";

const context: PaymentContext = {
  order_id: "local-example",
  attempt_id: "attempt-example",
  product_name: "Synthetic digital product",
  product_code: "example",
  amount_minor: 2800,
  currency: "BRL",
  method: "card",
  installments: 3,
  customer_id: "17",
  remote_order_id: "29",
};
const detail = (status = "aprovado", total = 2800) => ({
  data: {
    order: { id: 29, status, total_paid: total },
    customer: { id: 17 },
    payment: {
      method: "creditcard",
      installments: 3,
      paid_at: "2026-10-12 12:00:00",
    },
  },
});
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

test("normalizes approved payment but treats authorization as processing", () => {
  expect(appmaxSnapshot(detail(), context)).toMatchObject({
    state: "PAID",
    total_minor: 2800,
    remote_customer_id: "17",
  });
  expect(appmaxSnapshot(detail("autorizado"), context).state).toBe(
    "PROCESSING",
  );
  expect(
    appmaxSnapshot(detail("pendente_integracao_em_analise"), context),
  ).toMatchObject({ state: "PROCESSING", delivery_blocked: true });
  expect(appmaxDate("2026-10-12 12:00:00")!.toISOString()).toBe(
    "2026-10-12T15:00:00.000Z",
  );
});
test.each([
  "amount",
  "customer",
  "order",
  "method",
  "installments",
  "date",
  "unknown",
])("refuses inconsistent financial confirmation: %s", (kind) => {
  const body = detail();
  if (kind === "amount") body.data.order.total_paid = 2500;
  if (kind === "customer") body.data.customer.id = 18;
  if (kind === "order") body.data.order.id = 30;
  if (kind === "method") body.data.payment.method = "pix";
  if (kind === "installments") body.data.payment.installments = 4;
  if (kind === "date") body.data.payment.paid_at = "";
  if (kind === "unknown") body.data.order.status = "synthetic-unknown";
  expect(() => appmaxSnapshot(body, context)).toThrow();
});
test("quotes only the configured installments in cents, without invented rates", () => {
  expect(
    appmaxQuotes(
      {
        data: {
          installments: {
            "1": { total: 2500 },
            "3": { total: 2800 },
            "4": { total: 2900 },
            "12": { total: 4000 },
          },
          settings: { max_installments: 3, min_installment_value: 500 },
        },
      },
      2500,
    ),
  ).toEqual([
    { installments: 1, total_minor: 2500, interest_minor: 0 },
    { installments: 3, total_minor: 2800, interest_minor: 300 },
  ]);
  expect(() =>
    appmaxQuotes({ data: { installments: { "3": { total: 28.0 } } } }, 2500),
  ).not.toThrow();
  expect(
    appmaxQuotes({ data: { installments: { "3": { total: 28.0 } } } }, 2500),
  ).toEqual([]);
});
test("does not trust the environment field or accept Appstore envelopes as panel orders", () => {
  expect(
    decodeAppmaxPaymentWebhook({
      environment: "production",
      event: "OrderPaid",
      data: { id: 29, customer: { document_number: "synthetic" } },
    }),
  ).toEqual({ event: "OrderPaid", remote_order_id: "29" });
  expect(() =>
    decodeAppmaxPaymentWebhook({
      event: "order_paid",
      event_type: "order",
      data: { order_id: 29 },
    }),
  ).toThrow();
  process.env.APPMAX_WEBHOOK_TOKEN =
    "synthetic-endpoint-token-with-32-characters";
  expect(acceptsAppmaxWebhookToken("incorrect-token")).toBe(false);
  expect(acceptsAppmaxWebhookToken(process.env.APPMAX_WEBHOOK_TOKEN)).toBe(
    true,
  );
});
test("defaults to Appmax and rejects unknown or live environments", async () => {
  delete process.env.PAYMENT_PROVIDER;
  expect(selectedPaymentProvider()).toBe("appmax");
  process.env.PAYMENT_PROVIDER = "synthetic-unknown";
  expect(() => selectedPaymentProvider()).toThrow();
  Object.assign(process.env, {
    PAYMENT_ENVIRONMENT: "production",
    APPMAX_CLIENT_ID: "synthetic",
    APPMAX_CLIENT_SECRET: "synthetic",
  });
  const request = jest.fn();
  await expect(
    createAppmaxPaymentProvider({ request }).quotes(2500),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
test("uses merchant auth, caches its token, sends financed total once and keeps card data out of requests", async () => {
  Object.assign(process.env, {
    APPMAX_CLIENT_ID: "synthetic-client",
    APPMAX_CLIENT_SECRET: "synthetic-secret",
    PAYMENT_ENVIRONMENT: "sandbox",
  });
  const request = jest.fn(async (url: string, init: RequestInit) => {
    const body = init.body
      ? JSON.parse(String(init.body).startsWith("{") ? String(init.body) : "{}")
      : {};
    if (url.includes("oauth2"))
      return new Response(
        JSON.stringify({ access_token: "synthetic-bearer", expires_in: 3600 }),
        { status: 200 },
      );
    if (url.endsWith("/customers"))
      return new Response(JSON.stringify({ data: { customer: { id: 17 } } }), {
        status: 201,
      });
    if (url.endsWith("/orders")) {
      expect(body.products[0].unit_value).toBe(2800);
      return new Response(JSON.stringify({ data: { order: { id: 29 } } }), {
        status: 201,
      });
    }
    if (url.endsWith("/credit-card")) {
      expect(body.payment_data.credit_card.token).toBe("synthetic-card-token");
      expect(body.payment_data.credit_card).not.toHaveProperty("number");
      expect(body.payment_data.credit_card).not.toHaveProperty("cvv");
      return new Response(
        JSON.stringify({ data: { order: { id: 29, status: "autorizado" } } }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify(detail()), { status: 200 });
  }) as unknown as typeof fetch;
  const provider = createAppmaxPaymentProvider({ request });
  const buyer = {
    first_name: "Synthetic",
    last_name: "Buyer",
    email: "buyer@example.test",
    phone: "11999999999",
    document_number: "19100000000",
    ip: "192.0.2.1",
  };
  expect(await provider.createCustomer(buyer)).toBe("17");
  expect(await provider.createOrder(context)).toBe("29");
  expect(
    (await provider.pay(context, buyer, "synthetic-card-token")).state,
  ).toBe("PAID");
  expect(
    (request as jest.Mock).mock.calls.filter(([url]) => url.includes("oauth2")),
  ).toHaveLength(1);
});
test("sanitizes provider failures and does not retry a financial POST", async () => {
  Object.assign(process.env, {
    APPMAX_CLIENT_ID: "synthetic-client",
    APPMAX_CLIENT_SECRET: "synthetic-secret",
    PAYMENT_ENVIRONMENT: "sandbox",
  });
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "synthetic", expires_in: 3600 }),
      ),
    )
    .mockRejectedValueOnce(new Error("synthetic private payload"));
  try {
    await createAppmaxPaymentProvider({ request }).createOrder(context);
    throw new Error("expected failure");
  } catch (error) {
    expect((error as Error).message).not.toContain("private");
    expect((error as Error).cause).toBeUndefined();
  }
  expect(request).toHaveBeenCalledTimes(2);
});
test.each([
  "https://auth.appmax.com.br/oauth2/token",
  "https://example.test/token",
])(
  "refuses an unsafe authentication host before sending credentials",
  async (auth) => {
    Object.assign(process.env, {
      APPMAX_CLIENT_ID: "synthetic-client",
      APPMAX_CLIENT_SECRET: "synthetic-secret",
      APPMAX_AUTH_URL: auth,
      PAYMENT_ENVIRONMENT: "sandbox",
    });
    const request = jest.fn();
    expect(() => appmaxEndpoints()).toThrow();
    await expect(
      createAppmaxPaymentProvider({ request }).quotes(2500),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
test("read failures back off while financial POST remains unreplayed", async () => {
  Object.assign(process.env, {
    APPMAX_CLIENT_ID: "synthetic-client",
    APPMAX_CLIENT_SECRET: "synthetic-secret",
    PAYMENT_ENVIRONMENT: "sandbox",
  });
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "synthetic", expires_in: 3600 }),
      ),
    )
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(detail())));
  expect(
    (await createAppmaxPaymentProvider({ request }).retrieve(context)).state,
  ).toBe("PAID");
  expect(request).toHaveBeenCalledTimes(3);
});
test("expiring merchant tokens are renewed before another API call", async () => {
  Object.assign(process.env, {
    APPMAX_CLIENT_ID: "synthetic-client",
    APPMAX_CLIENT_SECRET: "synthetic-secret",
    PAYMENT_ENVIRONMENT: "sandbox",
  });
  const request = jest.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("oauth2")
            ? { access_token: "synthetic", expires_in: 30 }
            : detail(),
        ),
      ),
  ) as unknown as typeof fetch;
  const provider = createAppmaxPaymentProvider({ request });
  await provider.retrieve(context);
  await provider.retrieve(context);
  expect(
    (request as jest.Mock).mock.calls.filter(([url]) => url.includes("oauth2")),
  ).toHaveLength(2);
});
