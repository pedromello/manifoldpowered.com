import { z } from "zod";
import { ServiceError } from "infra/errors";
import { assertGiftCardSandbox } from "infra/gift_card_provider";

// Response field locations are private configuration. Never guess whether a
// supplier's price is cost or face value; fulfillment requires its own attestation.
const catalogMappingFields = {
  products_path: z.string(),
  variants_path: z.string().min(1).optional(),
  sku: z.string().min(1),
  name: z.string().min(1),
  face_value: z.string().min(1),
  currency: z.string().optional(),
  fixed_currency: z.literal("BRL").optional(),
  value_unit: z.enum(["major", "minor"]),
  cost: z.string().optional(),
  reference: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  submit_reference: z.string().min(1).optional(),
};
const catalogMappingSchema = z
  .object(catalogMappingFields)
  .strict()
  .refine((value) => Boolean(value.currency || value.fixed_currency));
const mappingSchema = z
  .object({
    ...catalogMappingFields,
    reference: z.string().min(1),
    status: z.string().min(1),
  })
  .strict()
  .refine((value) => Boolean(value.currency || value.fixed_currency));

export type EmailGiftProduct = {
  sku: string;
  name: string;
  amount_minor: number;
  provider_cost_minor: number | null;
  currency: string;
};
export type EmailGiftRequest = {
  request_id: string;
  sku: string;
  amount_minor: number;
  recipient: { name: string; document?: string; email: string };
};
export type EmailGiftTracking = {
  status: "pending" | "delivered" | "cancelled" | "unknown";
  reference: string | null;
  provider_status: number | null;
};
export interface EmailGiftProvider {
  products(): Promise<EmailGiftProduct[]>;
  submit(request: EmailGiftRequest): Promise<EmailGiftTracking>;
  track(requestId: string): Promise<EmailGiftTracking>;
}
export type EmailGiftCatalogProvider = Pick<EmailGiftProvider, "products">;

export class GiftCardApiError extends Error {
  constructor(
    public readonly category: string,
    public readonly retry_after_ms = 0,
  ) {
    super("Gift card service is temporarily unavailable.");
    this.name = "GiftCardApiError";
  }
}
export const emailGiftCardsSelected = () =>
  process.env.GIFT_CARD_PROVIDER === "api";
export const recipientDocumentRequired = () =>
  process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED === "true";

export function fieldAt(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split(".").reduce<unknown>((item, part) => {
    if (["__proto__", "constructor", "prototype"].includes(part))
      return undefined;
    return item !== null &&
      typeof item === "object" &&
      Object.hasOwn(item, part)
      ? (item as Record<string, unknown>)[part]
      : undefined;
  }, value);
}
export function minorValue(value: unknown, unit: "major" | "minor"): number {
  const source = typeof value === "number" ? String(value) : value;
  if (typeof source !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(source))
    throw new GiftCardApiError("INVALID_CONTRACT");
  const [whole, fraction = ""] = source.split(".");
  const amount =
    unit === "minor" && !fraction
      ? Number(whole)
      : unit === "major"
        ? Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
        : NaN;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647)
    throw new GiftCardApiError("INVALID_CONTRACT");
  return amount;
}

type ConfigurationKey =
  | "GIFT_CARD_PROVIDER_BASE_URL"
  | "GIFT_CARD_PROVIDER_RESPONSE_MAPPING"
  | "GIFT_CARD_PROVIDER_CONTRACT_VERIFIED"
  | "GIFT_CARD_PROVIDER_ENVIRONMENT"
  | "GIFT_CARD_PROVIDER_USERNAME"
  | "GIFT_CARD_PROVIDER_PASSWORD"
  | "GIFT_CARD_PROVIDER_TOKEN_SOURCE"
  | "GIFT_CARD_PROVIDER_API_TOKEN";

class GiftCardConfigurationError extends ServiceError {
  constructor(invalid: ConfigurationKey[]) {
    super({
      message: "Gift card sandbox configuration requires verification.",
      // The controller logs only this fixed vocabulary, never input values or
      // parser errors. Public error serialization deliberately excludes it.
      context: { invalid_configuration: invalid },
    });
  }

  toJSON() {
    return { ...super.toJSON(), context: undefined };
  }
}

function assertFulfillmentContract() {
  assertGiftCardSandbox();
  if (process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED !== "true")
    throw new GiftCardConfigurationError([
      "GIFT_CARD_PROVIDER_CONTRACT_VERIFIED",
    ]);
}

function createEmailGiftClient({
  transport = fetch,
  catalogOnly = false,
}: {
  transport?: typeof fetch;
  catalogOnly?: boolean;
} = {}): EmailGiftProvider {
  assertGiftCardSandbox();
  let base: URL;
  let mapping: z.infer<typeof catalogMappingSchema>;
  const tokenSource =
    process.env.GIFT_CARD_PROVIDER_TOKEN_SOURCE || "configured";
  const invalid: ConfigurationKey[] = [];
  try {
    base = new URL(process.env.GIFT_CARD_PROVIDER_BASE_URL!);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      invalid.push("GIFT_CARD_PROVIDER_BASE_URL");
  } catch {
    invalid.push("GIFT_CARD_PROVIDER_BASE_URL");
  }
  try {
    mapping = (catalogOnly ? catalogMappingSchema : mappingSchema).parse(
      JSON.parse(process.env.GIFT_CARD_PROVIDER_RESPONSE_MAPPING!),
    );
  } catch {
    invalid.push("GIFT_CARD_PROVIDER_RESPONSE_MAPPING");
  }
  if (
    !catalogOnly &&
    process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED !== "true"
  )
    invalid.push("GIFT_CARD_PROVIDER_CONTRACT_VERIFIED");
  if (process.env.GIFT_CARD_PROVIDER_ENVIRONMENT !== "sandbox")
    invalid.push("GIFT_CARD_PROVIDER_ENVIRONMENT");
  if (!process.env.GIFT_CARD_PROVIDER_USERNAME)
    invalid.push("GIFT_CARD_PROVIDER_USERNAME");
  if (!process.env.GIFT_CARD_PROVIDER_PASSWORD)
    invalid.push("GIFT_CARD_PROVIDER_PASSWORD");
  if (!["configured", "login"].includes(tokenSource))
    invalid.push("GIFT_CARD_PROVIDER_TOKEN_SOURCE");
  if (tokenSource === "configured" && !process.env.GIFT_CARD_PROVIDER_API_TOKEN)
    invalid.push("GIFT_CARD_PROVIDER_API_TOKEN");
  if (invalid.length) throw new GiftCardConfigurationError(invalid);
  let token: { value: string; expires: number } | undefined;
  let authenticating: Promise<string> | undefined;
  async function request(
    path: string,
    body?: unknown,
    bearer?: string,
  ): Promise<unknown> {
    assertGiftCardSandbox();
    if (!catalogOnly) assertFulfillmentContract();
    if (process.env.GIFT_CARD_PROVIDER_ENVIRONMENT !== "sandbox")
      throw new GiftCardConfigurationError(["GIFT_CARD_PROVIDER_ENVIRONMENT"]);
    const target = new URL(path, base);
    if (
      catalogOnly &&
      !(
        (target.pathname === "/api/authentication/login" &&
          body !== undefined) ||
        (target.pathname.startsWith("/api/products/") && body === undefined)
      )
    )
      throw new GiftCardApiError("CATALOG_ONLY");
    try {
      const response = await transport(target, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const raw = response.headers.get("retry-after");
        const retry = raw
          ? /^\d+$/.test(raw)
            ? Number(raw) * 1000
            : Date.parse(raw) - Date.now()
          : 0;
        throw new GiftCardApiError(
          response.status === 401
            ? "AUTHENTICATION_FAILED"
            : response.status === 429
              ? "RATE_LIMITED"
              : "PROVIDER_UNAVAILABLE",
          Math.min(86400000, Math.max(0, Number.isFinite(retry) ? retry : 0)),
        );
      }
      const content = await response.text();
      if (content.length > 2_000_000)
        throw new GiftCardApiError("INVALID_CONTRACT");
      return JSON.parse(content);
    } catch (error) {
      // Fetch errors contain URLs with credentials in path/query. Never retain
      // the original exception, its cause, or any response body.
      if (error instanceof GiftCardApiError) throw error;
      throw new GiftCardApiError("PROVIDER_UNAVAILABLE");
    }
  }
  async function authenticate(): Promise<string> {
    if (token && token.expires > Date.now() + 60000) return token.value;
    if (authenticating) return authenticating;
    authenticating = (async () => {
      const data = await request("/api/authentication/login", {
        username: process.env.GIFT_CARD_PROVIDER_USERNAME,
        password: process.env.GIFT_CARD_PROVIDER_PASSWORD,
      });
      // The sandbox may wrap the authentication model in a data envelope.
      // A malformed envelope must not fall back to unrelated top-level fields.
      const authentication =
        data !== null && typeof data === "object" && Object.hasOwn(data, "data")
          ? (data as Record<string, unknown>).data
          : data;
      const parsed = z
        .object({
          accessToken: z
            .string()
            .min(1)
            .refine((value) => value.trim().length > 0),
          expires: z.iso.datetime({ offset: true }),
        })
        .safeParse(authentication);
      if (!parsed.success || Date.parse(parsed.data.expires) <= Date.now())
        throw new GiftCardApiError("AUTHENTICATION_FAILED");
      token = {
        value: parsed.data.accessToken,
        expires: Date.parse(parsed.data.expires),
      };
      return token.value;
    })();
    try {
      return await authenticating;
    } finally {
      authenticating = undefined;
    }
  }
  const businessToken = (bearer: string) =>
    tokenSource === "login"
      ? bearer
      : process.env.GIFT_CARD_PROVIDER_API_TOKEN!;
  async function read(path: (token: string) => string) {
    try {
      const bearer = await authenticate();
      return await request(path(businessToken(bearer)), undefined, bearer);
    } catch (error) {
      if (
        !(error instanceof GiftCardApiError) ||
        error.category !== "AUTHENTICATION_FAILED"
      )
        throw error;
      token = undefined;
      const bearer = await authenticate();
      return request(path(businessToken(bearer)), undefined, bearer);
    }
  }
  function tracking(data: unknown): EmailGiftTracking {
    const status = fieldAt(data, mapping.status);
    const reference = fieldAt(data, mapping.reference);
    const code =
      typeof status === "number"
        ? status
        : typeof status === "string" && /^\d+$/.test(status)
          ? Number(status)
          : null;
    return {
      status:
        code === 3
          ? "delivered"
          : code === 7
            ? "cancelled"
            : code !== null
              ? "pending"
              : "unknown",
      reference:
        typeof reference === "string" &&
        reference.length > 0 &&
        reference.length <= 200
          ? reference
          : null,
      provider_status: code,
    };
  }
  return {
    async products() {
      assertGiftCardSandbox();
      if (!catalogOnly) assertFulfillmentContract();
      const data = fieldAt(
        await read(
          (apiToken) => `/api/products/${encodeURIComponent(apiToken)}`,
        ),
        mapping.products_path,
      );
      const limit = 10000;
      if (!Array.isArray(data) || data.length > limit || !data.length)
        throw new GiftCardApiError("INVALID_CONTRACT");
      const products: EmailGiftProduct[] = [];
      for (const item of data) {
        const sku = fieldAt(item, mapping.sku),
          name = fieldAt(item, mapping.name);
        const currency = mapping.currency
          ? fieldAt(item, mapping.currency)
          : mapping.fixed_currency;
        if (
          typeof sku !== "string" ||
          !sku.length ||
          sku.length > 200 ||
          typeof name !== "string" ||
          !name.trim() ||
          name.length > 200 ||
          currency !== "BRL"
        )
          throw new GiftCardApiError("INVALID_CONTRACT");
        const variants = mapping.variants_path
          ? fieldAt(item, mapping.variants_path)
          : [item];
        if (
          !Array.isArray(variants) ||
          variants.length > limit ||
          products.length + variants.length > limit
        )
          throw new GiftCardApiError("INVALID_CONTRACT");
        for (const variant of variants) {
          if (
            variant === null ||
            typeof variant !== "object" ||
            Array.isArray(variant)
          )
            throw new GiftCardApiError("INVALID_CONTRACT");
          const amount = minorValue(
            fieldAt(variant, mapping.face_value),
            mapping.value_unit,
          );
          if (!amount) throw new GiftCardApiError("INVALID_CONTRACT");
          products.push({
            sku,
            name: name.trim(),
            amount_minor: amount,
            currency,
            provider_cost_minor: mapping.cost
              ? minorValue(fieldAt(variant, mapping.cost), mapping.value_unit)
              : null,
          });
        }
      }
      if (
        !products.length ||
        new Set(products.map((p) => `${p.sku}:${p.amount_minor}`)).size !==
          products.length
      )
        throw new GiftCardApiError("INVALID_CONTRACT");
      return products;
    },
    async submit(input) {
      assertFulfillmentContract();
      // A financial fulfillment POST is never automatically repeated, even on
      // authentication errors. The durable worker reconciles its stable ID.
      const bearer = await authenticate();
      const response = await request(
        "/api/orders/virtual-card",
        {
          token: businessToken(bearer),
          codRequest: input.request_id,
          sku: input.sku,
          price: input.amount_minor / 100,
          name: input.recipient.name,
          document: input.recipient.document ?? null,
          email: input.recipient.email,
        },
        bearer,
      );
      const result = tracking(response);
      const acceptedReference = fieldAt(
        response,
        mapping.submit_reference ?? mapping.reference,
      );
      if (
        typeof acceptedReference !== "string" ||
        !acceptedReference.length ||
        acceptedReference.length > 200
      )
        throw new GiftCardApiError("INVALID_CONTRACT");
      return { ...result, reference: acceptedReference, status: "pending" }; // Tracking is delivery proof.
    },
    async track(requestId) {
      assertFulfillmentContract();
      return tracking(
        await read(
          (apiToken) =>
            `/api/orders/tracking/codrequest?${new URLSearchParams({ token: apiToken, codRequest: requestId })}`,
        ),
      );
    },
  };
}

export function createEmailGiftProvider(
  options: { transport?: typeof fetch } = {},
): EmailGiftProvider {
  return createEmailGiftClient({
    transport: options.transport,
    catalogOnly: false,
  });
}

export function createEmailGiftCatalogProvider(
  options: { transport?: typeof fetch } = {},
): EmailGiftCatalogProvider {
  const client = createEmailGiftClient({
    transport: options.transport,
    catalogOnly: true,
  });
  // This is a separate runtime capability, not a narrowed type over the full
  // provider. Even an unsafe cast cannot find submission or tracking methods.
  return Object.freeze({ products: client.products });
}

let configuredProvider: EmailGiftProvider | undefined;
export function emailGiftProvider() {
  assertFulfillmentContract();
  return (configuredProvider ??= createEmailGiftProvider());
}

let configuredCatalogProvider: EmailGiftCatalogProvider | undefined;
export function emailGiftCatalogProvider() {
  assertGiftCardSandbox();
  return (configuredCatalogProvider ??= createEmailGiftCatalogProvider());
}

export function emailGiftPurchasesConfigured() {
  if (
    !/^[a-fA-F0-9]{64}$/.test(
      process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY ?? "",
    )
  )
    return false;
  try {
    createEmailGiftProvider();
    return true;
  } catch {
    return false;
  }
}
