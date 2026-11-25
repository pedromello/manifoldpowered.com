import { isIP } from "node:net";
import { Prisma } from "generated/prisma/client";
import { z } from "zod";
import { ServiceError, ValidationError } from "infra/errors";
import { appmaxEndpoints, appmaxMerchantCredentials } from "./config";
import { PaymentLinkRejectedError, PaymentTransportError } from "./errors";
export { PaymentTransportError } from "./errors";
import type {
  PaymentContext,
  PaymentProvider,
  PaymentQuote,
  PaymentSnapshot,
  PaymentState,
} from "./types";

export function appmaxDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
      ? value.replace(" ", "T") + "-03:00"
      : value,
  );
  if (!Number.isFinite(date.getTime()))
    throw new PaymentTransportError(undefined, undefined, "payment_date");
  return date;
}
const states: Record<string, PaymentState> = {
  pendente: "PENDING",
  autorizado: "PROCESSING",
  aprovado: "PAID",
  integrado: "PAID",
  pendente_integracao: "PAID",
  pendente_integracao_em_analise: "PROCESSING",
  cancelado: "CANCELLED",
  recusado_por_risco: "FAILED",
  estornado: "REFUNDED",
  chargeback_em_tratativa: "DISPUTED",
  chargeback_em_disputa: "DISPUTED",
  chargeback_perdido: "DISPUTED",
  chargeback_vencido: "PAID",
};
const id = z
  .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .transform(String);
const money = z.number().int().nonnegative().max(2147483647);
export const appmaxPaymentLinkMinimum = 500;

const linkId = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)])
  .transform(String);
const checkoutLinkResponse = z.object({
  data: z.object({ id: linkId, checkout_url: z.string().min(1).max(2048) }),
});
const linkOrdersResponse = z.object({
  data: z.array(
    z.object({
      order: z.object({ id: linkId, status: z.string(), total: money }),
    }),
  ),
  meta: z.object({
    page: z.number().int().positive(),
    total_pages: z.number().int().nonnegative(),
  }),
});
const paymentLinkFields = new Set([
  "name",
  "value",
  "description",
  "product_type",
  "document",
  "payments",
  "max_installments",
  "fee_transfer_from_installment",
  "allow_multiple_sales",
]);
const errorFields = z.record(z.string(), z.unknown());
const linkValidationResponse = z.object({ errors: errorFields });

async function readPaymentLinkValidationFields(response: Response) {
  try {
    const limit = 16 * 1024;
    if (Number(response.headers.get("content-length")) > limit) return [];
    const body = await response.text();
    if (body.length > limit) return [];
    const parsed = linkValidationResponse.safeParse(JSON.parse(body));
    if (!parsed.success) return [];
    const { errors } = parsed.data;
    const messageFields = errorFields.safeParse(errors.message);
    return [
      ...new Set(
        [
          ...Object.keys(errors),
          ...(messageFields.success ? Object.keys(messageFields.data) : []),
        ]
          .map((key) => key.split(".", 1)[0])
          .filter((key) => paymentLinkFields.has(key)),
      ),
    ].sort();
  } catch {
    return [];
  }
}
export function appmaxQuotes(payload: unknown, amount: number): PaymentQuote[] {
  const schema = z.object({
    data: z.union([
      z.object({
        installments: z.record(z.string(), z.object({ total: money })),
        settings: z
          .object({
            max_installments: z.number().int().positive(),
            min_installment_value: money.optional(),
          })
          .optional(),
      }),
      z
        .object({
          // The sandbox also returns scalar installment totals in BRL.
          parcels: z.record(
            z.string(),
            z
              .number()
              .nonnegative()
              .max(21_474_836.47)
              .transform((total) => ({
                total: new Prisma.Decimal(total)
                  .mul(100)
                  .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
                  .toNumber(),
              })),
          ),
        })
        .transform(({ parcels }) => ({
          installments: parcels,
          settings: undefined,
        })),
    ]),
  });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new PaymentTransportError();
  const max = Math.min(12, parsed.data.data.settings?.max_installments ?? 12);
  const minimum = parsed.data.data.settings?.min_installment_value ?? 0;
  return Object.entries(parsed.data.data.installments)
    .flatMap(([key, value]) => {
      const count = Number(key);
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > max ||
        value.total < amount ||
        Math.floor(value.total / count) < minimum
      )
        return [];
      return [
        {
          installments: count,
          total_minor: value.total,
          interest_minor: value.total - amount,
        },
      ];
    })
    .sort((a, b) => a.installments - b.installments);
}

function readAppmaxOrder(payload: unknown) {
  const schema = z.object({
    data: z.object({
      order: z.object({
        id,
        status: z.string(),
        total_paid: money.nullish(),
        payment_link_id: z.unknown(),
        currency: z.unknown(),
      }),
      customer: z.object({ id }),
      payment: z
        .object({
          method: z.string().optional(),
          installments: z.unknown().optional(),
          paid_at: z.string().nullable().optional(),
          currency: z.unknown(),
        })
        .nullish(),
    }),
  });
  const result = schema.safeParse(payload);
  if (!result.success) {
    // The schema has fixed keys. Keep provider values and error messages out of logs.
    const fields = result.error.issues.map(({ path }) => path.join("."));
    throw new PaymentTransportError(
      undefined,
      undefined,
      "order_shape",
      fields,
    );
  }
  return result.data.data;
}

function appmaxOrderState(status: string) {
  if (!Object.hasOwn(states, status))
    throw new PaymentTransportError(undefined, undefined, "order_status");
  return states[status];
}

export function appmaxSnapshot(
  payload: unknown,
  context: PaymentContext,
): PaymentSnapshot {
  const { order, customer, payment } = readAppmaxOrder(payload);
  const state = appmaxOrderState(order.status);
  if (
    order.id !== context.remote_order_id ||
    customer.id !== context.customer_id
  )
    throw new PaymentTransportError(undefined, undefined, "order_identity");
  if (state === "PAID") {
    const fields: string[] = [];
    if (order.total_paid !== context.amount_minor)
      fields.push("order.total_paid");
    if (!payment?.paid_at) fields.push("payment.paid_at");
    if (payment?.method !== (context.method === "card" ? "creditcard" : "pix"))
      fields.push("payment.method");
    if (
      context.method === "card" &&
      payment?.installments !== context.installments
    )
      fields.push("payment.installments");
    if (fields.length)
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_evidence",
        fields,
      );
  }
  return {
    remote_order_id: order.id,
    remote_customer_id: customer.id,
    state,
    total_minor: state === "PAID" ? order.total_paid! : context.amount_minor,
    currency: "BRL",
    method: context.method,
    installments: context.installments,
    paid_at: appmaxDate(payment?.paid_at),
    delivery_blocked: order.status === "pendente_integracao_em_analise",
  };
}

function validatedLinkQuote(
  amount: number,
  installments: number,
): PaymentQuote {
  if (installments !== 1)
    throw new ValidationError({
      message: "This installment option is unavailable.",
    });
  if (!money.safeParse(amount).success || amount < appmaxPaymentLinkMinimum)
    throw new ValidationError({
      message: "This product is below the payment link minimum.",
      action: "Choose a product worth at least R$ 5.00.",
    });
  return { installments: 1, total_minor: amount, interest_minor: 0 };
}

function sandboxCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.hostname.endsWith(".sandboxappmax.com.br")
    )
      return url.href;
  } catch {
    // The provider URL is not safe to return to the browser.
  }
  throw new PaymentTransportError(undefined, undefined, "payment_link_url");
}

function pendingLink(
  input: PaymentContext,
  remoteOrderId: string,
  checkoutUrl?: string,
): PaymentSnapshot {
  return {
    remote_order_id: remoteOrderId,
    state: "PENDING",
    total_minor: input.amount_minor,
    currency: "BRL",
    method: "link",
    installments: 1,
    ...(checkoutUrl ? { checkout_url: checkoutUrl } : {}),
  };
}

function isFinancialState(state: PaymentState) {
  return state === "PAID" || state === "REFUNDED" || state === "DISPUTED";
}

export function createAppmaxPaymentProvider({
  request = fetch,
}: { request?: typeof fetch } = {}): PaymentProvider {
  let cachedToken: { value: string; until: number } | undefined;
  let tokenRequest: Promise<string> | undefined;
  let lastRequest = 0;
  let serial = Promise.resolve();
  const quotesCache = new Map<
    number,
    { until: number; quotes: PaymentQuote[] }
  >();
  async function http(url: string, init: RequestInit, safeRetry = false) {
    for (let attempt = 0; ; attempt++) {
      // One account, sandbox only. Serialize pacing; jobs provide durable retry.
      const turn = serial.then(async () => {
        const delay = Math.max(0, lastRequest + 220 - Date.now());
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        lastRequest = Date.now();
      });
      serial = turn.catch(() => {});
      await turn;
      let response: Response;
      try {
        response = await request(url, {
          ...init,
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        if (safeRetry && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt),
          );
          continue;
        }
        throw new PaymentTransportError();
      }
      if (!response.ok) {
        const retryHeader = response.headers.get("retry-after");
        const retrySeconds = retryHeader
          ? Number(retryHeader) ||
            Math.max(0, (Date.parse(retryHeader) - Date.now()) / 1000)
          : null;
        if (
          safeRetry &&
          attempt < 2 &&
          (response.status === 429 || response.status >= 500) &&
          (retrySeconds === null || retrySeconds <= 2) &&
          !(response.status === 429 && retrySeconds === null)
        ) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              retrySeconds === null
                ? 500 * 2 ** attempt
                : Math.max(0, retrySeconds * 1000),
            ),
          );
          continue;
        }
        throw new PaymentTransportError(
          Math.min(3600, Math.max(5, retrySeconds || 30)),
          response.status,
          url.endsWith("/oauth2/token") ? "authentication" : "request",
          response.status === 422 &&
            init.method === "POST" &&
            url.endsWith("/v1/payment-link")
            ? await readPaymentLinkValidationFields(response)
            : undefined,
        );
      }
      try {
        const body = await response.text();
        if (body.length > 1024 * 1024) throw new Error();
        return JSON.parse(body);
      } catch {
        throw new PaymentTransportError(
          undefined,
          response.status,
          "response_json",
        );
      }
    }
  }
  async function token() {
    const { auth } = appmaxEndpoints();
    const credentials = appmaxMerchantCredentials();
    if (!credentials)
      throw new ServiceError({ message: "Purchases are unavailable." });
    if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
    if (!tokenRequest)
      tokenRequest = (async () => {
        const payload = await http(
          auth,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              ...credentials,
            }),
          },
          true,
        );
        const parsed = z
          .object({
            access_token: z.string().min(1),
            expires_in: z.number().positive(),
          })
          .safeParse(payload);
        if (!parsed.success) throw new PaymentTransportError();
        cachedToken = {
          value: parsed.data.access_token,
          until: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000,
        };
        return cachedToken.value;
      })().finally(() => {
        tokenRequest = undefined;
      });
    return tokenRequest;
  }
  async function api(
    path: string,
    body?: unknown,
    safeRetry = body === undefined,
  ) {
    let auth: string;
    try {
      auth = await token();
    } catch (error) {
      if (path === "/v1/payment-link" && body !== undefined)
        throw new PaymentLinkRejectedError(
          undefined,
          error instanceof PaymentTransportError ? error.httpStatus : undefined,
          "authentication",
        );
      throw error;
    }
    return http(
      appmaxEndpoints().api + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      safeRetry,
    );
  }

  async function createLink(input: PaymentContext) {
    validatedLinkQuote(input.amount_minor, input.installments);
    let payload: unknown;
    try {
      payload = await api("/v1/payment-link", {
        name: input.product_name,
        description: input.product_name,
        value: input.amount_minor,
        product_type: "digital",
        payments: ["pix", "creditcard"],
        max_installments: 1,
        fee_transfer_from_installment: 0,
        allow_multiple_sales: false,
      });
    } catch (error) {
      if (
        error instanceof PaymentTransportError &&
        error.httpStatus !== undefined &&
        [400, 401, 403, 422].includes(error.httpStatus) &&
        error.stage === "request"
      )
        throw new PaymentLinkRejectedError(
          undefined,
          error.httpStatus,
          "payment_link_rejected",
          error.fields,
        );
      throw error;
    }
    const parsed = checkoutLinkResponse.safeParse(payload);
    if (!parsed.success)
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_link_shape",
      );
    const { id, checkout_url } = parsed.data.data;
    return pendingLink(input, `link:${id}`, sandboxCheckoutUrl(checkout_url));
  }

  async function readLink(
    input: PaymentContext,
    reference: string,
  ): Promise<PaymentSnapshot> {
    const parsedId = linkId.safeParse(reference.slice("link:".length));
    if (
      !reference.startsWith("link:") ||
      !parsedId.success ||
      input.currency !== "BRL" ||
      input.method !== "link"
    )
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_link_identity",
      );
    const listPath = `/v1/payment-link/${parsedId.data}/orders`;
    const orders = new Map<
      string,
      z.infer<typeof linkOrdersResponse>["data"][number]["order"]
    >();
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const parsed = linkOrdersResponse.safeParse(
        await api(page === 1 ? listPath : `${listPath}?page=${page}`),
      );
      if (
        !parsed.success ||
        parsed.data.meta.page !== page ||
        parsed.data.meta.total_pages > 10
      )
        throw new PaymentTransportError(
          undefined,
          undefined,
          "payment_link_orders_shape",
        );
      totalPages = parsed.data.meta.total_pages;
      for (const { order } of parsed.data.data) orders.set(order.id, order);
    }
    const financialOrders = [...orders.values()].filter(
      (order) =>
        isFinancialState(appmaxOrderState(order.status)) ||
        order.status === "pendente_integracao_em_analise",
    );
    if (
      financialOrders.length > 1 ||
      (input.remote_payment_id &&
        financialOrders.some(({ id }) => id !== input.remote_payment_id))
    )
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_link_multiple_payments",
      );
    const settled = input.remote_payment_id
      ? orders.get(input.remote_payment_id)
      : financialOrders[0];
    if (!settled) {
      if (input.remote_payment_id)
        throw new PaymentTransportError(
          undefined,
          undefined,
          "payment_link_order_identity",
        );
      return pendingLink(input, reference);
    }
    if (settled.total !== input.amount_minor)
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_link_order_amount",
      );

    const { order, payment } = readAppmaxOrder(
      await api(`/v1/orders/${settled.id}`),
    );
    const state = appmaxOrderState(order.status);
    const detailLinkId = linkId.safeParse(order.payment_link_id);
    if (
      order.id !== settled.id ||
      (order.payment_link_id != null &&
        (!detailLinkId.success || detailLinkId.data !== parsedId.data)) ||
      [order.currency, payment?.currency].some(
        (currency) =>
          currency != null &&
          (typeof currency !== "string" || currency.toUpperCase() !== "BRL"),
      )
    )
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_link_order_identity",
      );

    const method =
      payment?.method === "creditcard"
        ? "card"
        : payment?.method === "pix"
          ? "pix"
          : "link";
    const paidAt = appmaxDate(payment?.paid_at);
    if (
      state === "PAID" &&
      (order.total_paid !== input.amount_minor ||
        !paidAt ||
        method === "link" ||
        (method === "card" && payment?.installments !== 1))
    )
      throw new PaymentTransportError(
        undefined,
        undefined,
        "payment_link_payment_evidence",
      );
    if (!isFinancialState(state) && !input.remote_payment_id)
      return {
        ...pendingLink(input, reference),
        ...(order.status === "pendente_integracao_em_analise"
          ? { state: "PROCESSING", delivery_blocked: true }
          : {}),
      };
    return {
      ...pendingLink(input, reference),
      remote_payment_id: settled.id,
      state,
      method,
      paid_at: paidAt,
      delivery_blocked: order.status === "pendente_integracao_em_analise",
    };
  }

  const provider: PaymentProvider = {
    name: "appmax",
    configured: () => {
      try {
        appmaxEndpoints();
        return Boolean(appmaxMerchantCredentials());
      } catch {
        return false;
      }
    },
    capabilities: {
      methods: ["link"],
      installments: false,
      hosted: true,
    },
    async quote(amount, installments, method) {
      if (method === "link") return validatedLinkQuote(amount, installments);
      if (method === "pix")
        return { installments: 1, total_minor: amount, interest_minor: 0 };
      const quotes = await provider.quotes(amount);
      const quote = quotes.find((item) => item.installments === installments);
      if (!quote)
        throw new ValidationError({
          message: "This installment option is unavailable.",
        });
      return quote;
    },
    async quotes(amount) {
      const cached = quotesCache.get(amount);
      if (cached && cached.until > Date.now()) return cached.quotes;
      const quotes = appmaxQuotes(
        await api(
          "/v1/payments/installments",
          {
            installments: 12,
            total_value: amount,
            settings: true,
          },
          true,
        ),
        amount,
      );
      if (quotesCache.size > 128) quotesCache.clear();
      quotesCache.set(amount, { until: Date.now() + 60000, quotes });
      return quotes;
    },
    async createCustomer(buyer) {
      if (!isIP(buyer.ip))
        throw new ValidationError({
          message: "Please check your purchase details.",
        });
      const { first_name, last_name, email, phone, document_number, ip } =
        buyer;
      const parsed = z
        .object({ data: z.object({ customer: z.object({ id }) }) })
        .safeParse(
          await api("/v1/customers", {
            first_name,
            last_name,
            email,
            phone,
            document_number,
            ip,
          }),
        );
      if (!parsed.success) throw new PaymentTransportError();
      return parsed.data.data.customer.id;
    },
    async createOrder(input) {
      const parsed = z
        .object({ data: z.object({ order: z.object({ id }) }) })
        .safeParse(
          await api("/v1/orders", {
            customer_id: Number(input.customer_id),
            shipping_value: 0,
            discount_value: 0,
            products: [
              {
                sku: input.product_code,
                name: input.product_name,
                quantity: 1,
                unit_value: input.amount_minor,
                type: "digital",
              },
            ],
          }),
        );
      if (!parsed.success) throw new PaymentTransportError();
      return parsed.data.data.order.id;
    },
    async pay(input, buyer, cardToken) {
      if (input.currency !== "BRL")
        throw new ValidationError({
          message: "This payment currency is unavailable.",
        });
      if (input.method === "link")
        return input.remote_order_id
          ? provider.retrieve(input)
          : createLink(input);
      if (!buyer)
        throw new ValidationError({
          message: "Please check your purchase details.",
        });
      if (input.method === "pix") {
        const parsed = z
          .object({
            data: z.object({
              payment: z.object({
                pix_qrcode: z
                  .string()
                  .min(1)
                  .max(700000)
                  .regex(/^[A-Za-z0-9+/=]+$/),
                pix_emv: z.string().min(1).max(1000),
                pix_expiration_date: z.string(),
              }),
            }),
          })
          .safeParse(
            await api("/v1/payments/pix", {
              order_id: Number(input.remote_order_id),
              payment_data: { pix: { document_number: buyer.document_number } },
            }),
          );
        if (!parsed.success) throw new PaymentTransportError();
        return {
          remote_order_id: input.remote_order_id!,
          remote_customer_id: input.customer_id,
          state: "PENDING",
          total_minor: input.amount_minor,
          currency: "BRL",
          method: "pix",
          installments: 1,
          pix_qrcode: parsed.data.data.payment.pix_qrcode,
          pix_emv: parsed.data.data.payment.pix_emv,
          expires_at: appmaxDate(parsed.data.data.payment.pix_expiration_date),
        };
      }
      if (!cardToken)
        throw new ValidationError({
          message: "Please check your card details.",
        });
      await api("/v1/payments/credit-card", {
        order_id: Number(input.remote_order_id),
        customer_id: Number(input.customer_id),
        payment_data: {
          credit_card: {
            token: cardToken,
            holder_document_number:
              buyer.holder_document_number || buyer.document_number,
            holder_name:
              buyer.holder_name || `${buyer.first_name} ${buyer.last_name}`,
            installments: input.installments,
          },
        },
      });
      return provider.retrieve(input);
    },
    async retrieve(input) {
      if (input.method === "link" || input.remote_order_id?.startsWith("link:"))
        return readLink(input, input.remote_order_id ?? "");
      return appmaxSnapshot(
        await api(`/v1/orders/${encodeURIComponent(input.remote_order_id!)}`),
        input,
      );
    },
  };
  return provider;
}

export const appmaxPaymentProvider = createAppmaxPaymentProvider();
