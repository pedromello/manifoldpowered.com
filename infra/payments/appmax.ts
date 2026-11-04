import { isIP } from "node:net";
import { z } from "zod";
import { ServiceError, ValidationError } from "infra/errors";
import { assertPaymentSandbox, appmaxEndpoints } from "./config";
import { PaymentTransportError } from "./errors";
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
  if (!Number.isFinite(date.getTime())) throw new PaymentTransportError();
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
export function appmaxQuotes(payload: unknown, amount: number): PaymentQuote[] {
  const schema = z.object({
    data: z.object({
      installments: z.record(z.string(), z.object({ total: money })),
      settings: z
        .object({
          max_installments: z.number().int().positive(),
          min_installment_value: money.optional(),
        })
        .optional(),
    }),
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

export function appmaxSnapshot(
  payload: unknown,
  context: PaymentContext,
): PaymentSnapshot {
  const schema = z.object({
    data: z.object({
      order: z.object({
        id,
        status: z.string(),
        total_paid: money.optional(),
        amounts: z
          .object({
            sub_total: money,
            shipping_value: money,
            discount: money,
            installment_fee: money,
          })
          .optional(),
      }),
      customer: z.object({ id }),
      payment: z
        .object({
          method: z.string().optional(),
          installments: z.number().int().positive().optional(),
          paid_at: z.string().nullable().optional(),
        })
        .passthrough()
        .optional(),
    }),
  });
  const result = schema.safeParse(payload);
  if (!result.success) throw new PaymentTransportError();
  const { order, customer, payment } = result.data.data;
  const state = states[order.status];
  if (
    !state ||
    order.id !== context.remote_order_id ||
    customer.id !== context.customer_id
  )
    throw new PaymentTransportError();
  if (
    state === "PAID" &&
    (!payment?.paid_at ||
      order.total_paid !== context.amount_minor ||
      payment.method !== (context.method === "card" ? "creditcard" : "pix") ||
      (context.method === "card" &&
        payment.installments !== context.installments))
  )
    throw new PaymentTransportError();
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
        );
      }
      try {
        const body = await response.text();
        if (body.length > 1024 * 1024) throw new Error();
        return JSON.parse(body);
      } catch {
        throw new PaymentTransportError();
      }
    }
  }
  async function token() {
    assertPaymentSandbox();
    if (!provider.configured())
      throw new ServiceError({ message: "Purchases are unavailable." });
    if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
    if (!tokenRequest)
      tokenRequest = (async () => {
        const payload = await http(
          appmaxEndpoints().auth,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: process.env.APPMAX_CLIENT_ID!,
              client_secret: process.env.APPMAX_CLIENT_SECRET!,
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
    const auth = await token();
    return http(
      appmaxEndpoints().api + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${auth}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      safeRetry,
    );
  }
  const provider: PaymentProvider = {
    name: "appmax",
    configured: () => {
      try {
        appmaxEndpoints();
        return Boolean(
          process.env.APPMAX_CLIENT_ID && process.env.APPMAX_CLIENT_SECRET,
        );
      } catch {
        return false;
      }
    },
    capabilities: {
      methods: ["pix", "card"],
      installments: true,
      hosted: false,
    },
    async quote(amount, installments, method) {
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
      return appmaxSnapshot(
        await api(`/v1/orders/${encodeURIComponent(input.remote_order_id!)}`),
        input,
      );
    },
  };
  return provider;
}

export const appmaxPaymentProvider = createAppmaxPaymentProvider();
