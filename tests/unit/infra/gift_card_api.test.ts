import {
  createEmailGiftProvider,
  GiftCardApiError,
  minorValue,
} from "infra/gift_card_api";

const original = { ...process.env };
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), { status, headers });
beforeEach(() => {
  Object.assign(process.env, {
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
      cost: "cost",
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
const login = () =>
  json({
    accessToken: "synthetic-login-token",
    expires: new Date(Date.now() + 3600000).toISOString(),
  });

test("accepts an authentication data envelope without requiring optional notification metadata to be empty", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(
      json({
        data: {
          accessToken: "synthetic-login-token",
          expires: new Date(Date.now() + 3600000).toISOString(),
          authenticationError: null,
          showMessage: true,
          message: null,
        },
        invalidFields: [],
        notifications: [{ kind: "information" }],
      }),
    )
    .mockResolvedValueOnce(
      json({ state: 3, reference: "synthetic-reference" }),
    );
  expect(
    (await createEmailGiftProvider({ transport }).track("synthetic-order"))
      .status,
  ).toBe("delivered");
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1][1].headers.Authorization).toBe(
    "Bearer synthetic-login-token",
  );
});

test.each([
  { accessToken: null, expires: new Date(Date.now() + 3600000).toISOString() },
  { accessToken: "", expires: new Date(Date.now() + 3600000).toISOString() },
  { accessToken: "   ", expires: new Date(Date.now() + 3600000).toISOString() },
  { accessToken: 123, expires: new Date(Date.now() + 3600000).toISOString() },
  { accessToken: "synthetic-login-token", expires: "invalid-expiration" },
  { accessToken: "synthetic-login-token", expires: "2000-01-01T00:00:00.000Z" },
])(
  "rejects an invalid authentication envelope before reading products: %j",
  async (authentication) => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const transport = jest.fn().mockImplementation(async () =>
      json({
        data: {
          ...authentication,
          authenticationError: 3,
          showMessage: false,
          message: "synthetic-private-business-detail",
        },
        invalidFields: [],
        notifications: [],
      }),
    );
    const error = await createEmailGiftProvider({ transport })
      .products()
      .catch((value) => value);
    expect(error).toMatchObject({ category: "AUTHENTICATION_FAILED" });
    expect(error.cause).toBeUndefined();
    expect(
      transport.mock.calls.every(
        ([url]) =>
          new URL(String(url)).pathname === "/api/authentication/login",
      ),
    ).toBe(true);
    expect(JSON.stringify(error)).not.toContain(
      "synthetic-private-business-detail",
    );
    expect(String(error)).not.toContain("synthetic-login-token");
    expect(log).not.toHaveBeenCalled();
  },
);

test("a malformed data envelope cannot use valid top-level fields as a fallback", async () => {
  const transport = jest.fn().mockImplementation(async () =>
    json({
      data: null,
      accessToken: "synthetic-unrelated-token",
      expires: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
  await expect(
    createEmailGiftProvider({ transport }).products(),
  ).rejects.toMatchObject({ category: "AUTHENTICATION_FAILED" });
  expect(
    transport.mock.calls.every(
      ([url]) => new URL(String(url)).pathname === "/api/authentication/login",
    ),
  ).toBe(true);
});

test("normalizes exact nominal money independently from supplier cost", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      json({
        items: [
          {
            id: "synthetic-sku",
            label: "Sample credit",
            credit: "25.10",
            cost: "23.00",
          },
        ],
      }),
    );
  const provider = createEmailGiftProvider({ transport });
  expect(await provider.products()).toEqual([
    {
      sku: "synthetic-sku",
      name: "Sample credit",
      amount_minor: 2510,
      provider_cost_minor: 2300,
      currency: "BRL",
    },
  ]);
  const [url, options] = transport.mock.calls[1];
  expect(String(url)).toBe(
    "https://supplier.example.test/api/products/synthetic-api-token",
  );
  expect(options.headers.Authorization).toBe("Bearer synthetic-login-token");
  expect(options.redirect).toBe("error");
});

test("rejects missing configuration and ambiguous credit values", async () => {
  delete process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED;
  expect(() => createEmailGiftProvider()).toThrow(
    "configuration requires verification",
  );
  for (const value of ["25,00", "1e3", -1, "12.345", Infinity])
    expect(() => minorValue(value, "major")).toThrow(GiftCardApiError);
  expect(minorValue("25.10", "major")).toBe(2510);
  expect(minorValue(2500, "minor")).toBe(2500);
});

test("refreshes expired authentication once for reads", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(json({}, 401))
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      json({ state: 3, reference: "synthetic-reference" }),
    );
  const provider = createEmailGiftProvider({ transport });
  expect(await provider.track("synthetic-order")).toEqual({
    status: "delivered",
    provider_status: 3,
    reference: "synthetic-reference",
  });
  expect(transport).toHaveBeenCalledTimes(4);
});

test("can use the current login token for business endpoints when explicitly configured", async () => {
  process.env.GIFT_CARD_PROVIDER_TOKEN_SOURCE = "login";
  delete process.env.GIFT_CARD_PROVIDER_API_TOKEN;
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      json({ state: 3, reference: "synthetic-reference" }),
    );
  expect(
    (await createEmailGiftProvider({ transport }).track("synthetic-order"))
      .status,
  ).toBe("delivered");
  const url = new URL(String(transport.mock.calls[1][0]));
  expect(url.searchParams.get("token")).toBe("synthetic-login-token");
});

test("does not replay a submission on authentication failure", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(json({}, 401));
  const provider = createEmailGiftProvider({ transport });
  await expect(
    provider.submit({
      request_id: "synthetic-order",
      sku: "synthetic-sku",
      amount_minor: 2500,
      recipient: { name: "Sample Buyer", email: "buyer@example.test" },
    }),
  ).rejects.toMatchObject({ category: "AUTHENTICATION_FAILED" });
  expect(transport).toHaveBeenCalledTimes(2);
});

test("submission acceptance cannot complete delivery and unexpected secrets are discarded", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      json({
        state: 3,
        reference: "synthetic-reference",
        code: "NEVER-RETURN-THIS",
      }),
    );
  const provider = createEmailGiftProvider({ transport });
  const result = await provider.submit({
    request_id: "synthetic-order",
    sku: "synthetic-sku",
    amount_minor: 2500,
    recipient: {
      name: "Sample Buyer",
      email: "buyer@example.test",
      document: "00000000000",
    },
  });
  expect(result.status).toBe("pending");
  expect(JSON.stringify(result)).not.toContain("NEVER-RETURN-THIS");
  expect(JSON.parse(transport.mock.calls[1][1].body)).toMatchObject({
    codRequest: "synthetic-order",
    price: 25,
    email: "buyer@example.test",
  });
});

test("transport errors cannot expose a credential-bearing URL or original cause", async () => {
  const transport = jest
    .fn()
    .mockRejectedValue(
      new Error("https://secret.example.test/path/private-token"),
    );
  const error = await createEmailGiftProvider({ transport })
    .products()
    .catch((value) => value);
  expect(error.message).toBe("Gift card service is temporarily unavailable.");
  expect(error.cause).toBeUndefined();
  expect(String(error)).not.toContain("private-token");
});

test("unknown tracking and rate limits do not imply cancellation", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(json({ arbitrary: true }))
    .mockResolvedValueOnce(json({}, 429, { "retry-after": "36000" }));
  const provider = createEmailGiftProvider({ transport });
  expect((await provider.track("synthetic-order")).status).toBe("unknown");
  await expect(provider.track("synthetic-order")).rejects.toMatchObject({
    category: "RATE_LIMITED",
    retry_after_ms: 36000000,
  });
});
