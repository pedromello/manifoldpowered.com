import {
  createEmailGiftProvider,
  GiftCardApiError,
  type GiftCardInvalidField,
} from "infra/gift_card_api";

const original = { ...process.env };
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers });
const login = () =>
  json({
    data: {
      accessToken: "synthetic-login-token",
      expires: new Date(Date.now() + 3600000).toISOString(),
    },
  });
const order = {
  request_id: "synthetic-order",
  sku: "synthetic-sku",
  amount_minor: 2500,
  recipient: { name: "Synthetic Buyer", email: "buyer@example.test" },
};
beforeEach(() => {
  Object.assign(process.env, {
    PAYMENT_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_BASE_URL: "https://supplier.example.test",
    GIFT_CARD_PROVIDER_USERNAME: "synthetic-user",
    GIFT_CARD_PROVIDER_PASSWORD: "synthetic-password",
    GIFT_CARD_PROVIDER_API_TOKEN: "synthetic-api-token",
    GIFT_CARD_PROVIDER_TOKEN_SOURCE: "configured",
    GIFT_CARD_PROVIDER_CONTRACT_VERIFIED: "true",
    GIFT_CARD_PROVIDER_RESPONSE_MAPPING: JSON.stringify({
      products_path: "items",
      sku: "key",
      name: "label",
      face_value: "credit",
      fixed_currency: "BRL",
      value_unit: "major",
      reference: "reference",
      status: "state",
    }),
  });
});
afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
});

async function failure(
  response: Response,
  operation: "submit" | "track" | "catalog" = "submit",
) {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(response);
  const provider = createEmailGiftProvider({ transport });
  const result =
    operation === "submit"
      ? provider.submit(order)
      : operation === "track"
        ? provider.track(order.request_id)
        : provider.products();
  const error = await result.catch((value) => value);
  expect(error).toBeInstanceOf(GiftCardApiError);
  return { error: error as GiftCardApiError, transport };
}

test.each([400, 422])(
  "HTTP %i preserves only canonical validation field names without retrying submission",
  async (status) => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const raw = {
      invalidFields: [
        { key: "Document", message: "synthetic-private-document-value" },
        { key: " email ", message: "synthetic-private-email-value" },
        { key: "document", message: "synthetic-private-duplicate" },
        {
          key: "synthetic-private-field-name",
          message: "synthetic-private-message",
        },
        { key: "buyer@example.test", message: "synthetic-private-message" },
      ],
      notifications: ["Synthetic request was rejected."],
      cardCode: "synthetic-private-card-code",
      token: "synthetic-private-response-token",
    };
    const { error, transport } = await failure(json(raw, status));
    expect(error).toMatchObject({
      category: "VALIDATION_FAILED",
      http_status: status,
      operation: "submit",
      invalid_fields: ["document", "email"],
    });
    expect(error.message).toBe("Gift card service is temporarily unavailable.");
    expect(error.cause).toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(2);
    for (const value of [
      "synthetic-private",
      "buyer@example.test",
      "https://",
      "Synthetic request was rejected.",
    ])
      expect(JSON.stringify(error)).not.toContain(value);
    expect(log).not.toHaveBeenCalled();
  },
);

test("a tracking lookup with a recognized not-found notification is distinct from validation", async () => {
  const { error, transport } = await failure(
    json(
      { invalidFields: [], notifications: ["Synthetic order not found."] },
      400,
    ),
    "track",
  );
  expect(error).toMatchObject({
    category: "TRACKING_NOT_FOUND",
    http_status: 400,
    invalid_fields: [],
    operation: "track",
  });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(error)).not.toContain("Synthetic order not found.");
});

test("validation fields take precedence over a tracking not-found notification", async () => {
  const { error } = await failure(
    json(
      {
        invalidFields: [
          { key: "CodRequest", message: "synthetic-private-validation" },
        ],
        notifications: ["Synthetic order not found."],
      },
      400,
    ),
    "track",
  );
  expect(error).toMatchObject({
    category: "VALIDATION_FAILED",
    http_status: 400,
    invalid_fields: ["codRequest"],
    operation: "track",
  });
});

test.each(["submit", "catalog"] as const)(
  "a not-found notification cannot classify %s as a missing tracking order",
  async (operation) => {
    const { error, transport } = await failure(
      json({ notifications: ["Synthetic order not found."] }, 400),
      operation,
    );
    expect(error).toMatchObject({
      category: "VALIDATION_FAILED",
      http_status: 400,
      operation,
    });
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

test.each([401, 403])(
  "HTTP %i submission authentication failure never repeats the POST",
  async (status) => {
    const { error, transport } = await failure(
      json({ notifications: ["synthetic-private-auth-detail"] }, status),
    );
    expect(error).toMatchObject({
      category: "AUTHENTICATION_FAILED",
      http_status: status,
      operation: "submit",
      invalid_fields: [],
    });
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

test.each([401, 403])(
  "a failed login with HTTP %i is identified before any operational request",
  async (status) => {
    const transport = jest.fn().mockResolvedValueOnce(
      json(
        {
          invalidFields: [
            { key: "Username", message: "synthetic-private-auth-detail" },
            { key: "Document", message: "synthetic-private-unrelated-field" },
          ],
        },
        status,
      ),
    );
    const error = await createEmailGiftProvider({ transport })
      .track(order.request_id)
      .catch((value) => value);
    expect(error).toMatchObject({
      category: "AUTHENTICATION_FAILED",
      http_status: status,
      operation: "authentication",
      invalid_fields: ["username"],
    });
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

test("a forbidden tracking lookup does not refresh or replay authentication", async () => {
  const { error, transport } = await failure(json({}, 403), "track");
  expect(error).toMatchObject({
    category: "AUTHENTICATION_FAILED",
    http_status: 403,
    operation: "track",
  });
  expect(transport).toHaveBeenCalledTimes(2);
});

test("an unauthorized read refreshes once and cannot retry indefinitely", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(json({}, 401))
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(json({}, 401));
  await expect(
    createEmailGiftProvider({ transport }).track(order.request_id),
  ).rejects.toMatchObject({
    category: "AUTHENTICATION_FAILED",
    http_status: 401,
    operation: "track",
  });
  expect(transport).toHaveBeenCalledTimes(4);
});

test.each([429, 500, 503])(
  "HTTP %i retains bounded retry metadata and never replays a submission",
  async (status) => {
    const { error, transport } = await failure(
      json({ notifications: ["Synthetic order not found."] }, status, {
        "retry-after": "30",
      }),
    );
    expect(error).toMatchObject({
      category: status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      http_status: status,
      operation: "submit",
      retry_after_ms: 30000,
    });
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

test("transport failures retain no source URL, body, message or cause", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockRejectedValueOnce(
      new Error(
        "https://secret.example.test/private-token?document=synthetic-private-value",
      ),
    );
  const error = await createEmailGiftProvider({ transport })
    .submit(order)
    .catch((value) => value);
  expect(error).toMatchObject({
    category: "PROVIDER_UNAVAILABLE",
    http_status: null,
    invalid_fields: [],
    operation: "submit",
  });
  expect(error.cause).toBeUndefined();
  expect(JSON.stringify(error)).not.toContain("synthetic-private");
  expect(String(error)).not.toContain("secret.example.test");
  expect(transport).toHaveBeenCalledTimes(2);
});

test.each([
  () => new Response("synthetic-private-invalid-json", { status: 400 }),
  () =>
    json(
      {
        padding: "x".repeat(17000),
        notifications: ["Synthetic order not found."],
      },
      400,
    ),
  () =>
    json({ notifications: [{ message: "Synthetic order not found." }] }, 400),
  () => json({ notifications: ["x".repeat(1025) + " not found"] }, 400),
])(
  "unknown or oversized diagnostics cannot claim a missing tracking order",
  async (response) => {
    const { error } = await failure(response(), "track");
    expect(error).toMatchObject({
      category: "VALIDATION_FAILED",
      http_status: 400,
      invalid_fields: [],
      operation: "track",
    });
    expect(JSON.stringify(error)).not.toContain("synthetic-private");
  },
);

test("error details cannot retain unknown fields, duplicate keys or an arbitrary operation", () => {
  const error = new GiftCardApiError("VALIDATION_FAILED", 0, {
    http_status: 999,
    invalid_fields: [
      "document",
      "synthetic-private-unknown-field",
      "document",
      "email",
    ] as GiftCardInvalidField[],
    operation: "synthetic-private-operation" as "submit",
  });
  expect(error).toMatchObject({
    http_status: null,
    invalid_fields: ["document", "email"],
    operation: null,
  });
  expect(Object.isFrozen(error.invalid_fields)).toBe(true);
  expect(JSON.stringify(error)).not.toContain("synthetic-private");
});
