import {
  createEmailGiftCatalogProvider,
  createEmailGiftProvider,
  emailGiftProvider,
  emailGiftPurchasesConfigured,
  type EmailGiftProvider,
} from "infra/gift_card_api";

const original = { ...process.env };
const mapping = {
  products_path: "items",
  variants_path: "variants",
  sku: "key",
  name: "label",
  currency: "currency",
  face_value: "options.credit",
  cost: "options.cost",
  value_unit: "major",
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
const login = () =>
  json({
    data: {
      accessToken: "synthetic-token",
      expires: new Date(Date.now() + 3600000).toISOString(),
    },
  });
const parent = (key: string, variants: unknown) => ({
  key,
  label: "Synthetic credit",
  currency: "BRL",
  variants,
});
const option = (credit = 25, cost = 27) => ({ options: { credit, cost } });
const request = {
  request_id: "synthetic-order",
  sku: "synthetic-sku",
  amount_minor: 2500,
  recipient: { name: "Sample Buyer", email: "buyer@example.test" },
};

beforeEach(() => {
  Object.assign(process.env, {
    PAYMENT_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_BASE_URL: "https://supplier.example.test",
    GIFT_CARD_PROVIDER_USERNAME: "synthetic-user",
    GIFT_CARD_PROVIDER_PASSWORD: "synthetic-password",
    GIFT_CARD_PROVIDER_API_TOKEN: "synthetic-api-token",
    GIFT_CARD_PROVIDER_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_CONTRACT_VERIFIED: "false",
    GIFT_CARD_PROVIDER_TOKEN_SOURCE: "configured",
    GIFT_CARD_PROVIDER_RESPONSE_MAPPING: JSON.stringify(mapping),
    GIFT_CARD_RECIPIENT_ENCRYPTION_KEY: "a".repeat(64),
  });
});
afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
});

function catalog(items: unknown[]) {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(json({ items }));
  return { provider: createEmailGiftCatalogProvider({ transport }), transport };
}
function fullConfiguration() {
  process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED = "true";
  process.env.GIFT_CARD_PROVIDER_RESPONSE_MAPPING = JSON.stringify({
    ...mapping,
    reference: "reference",
    status: "state",
  });
}

test("normalizes record variants without joining independent arrays or changing parent identity and currency", async () => {
  const { provider, transport } = catalog([
    {
      ...parent("synthetic-first", [
        option(100, 117),
        { ...option(25, 27), currency: "USD" },
      ]),
      alternatives: [25, 100],
    },
    parent("synthetic-empty", []),
    parent("synthetic-second", [option(50, 54)]),
  ]);
  expect(await provider.products()).toEqual([
    {
      sku: "synthetic-first",
      name: "Synthetic credit",
      amount_minor: 10000,
      provider_cost_minor: 11700,
      currency: "BRL",
    },
    {
      sku: "synthetic-first",
      name: "Synthetic credit",
      amount_minor: 2500,
      provider_cost_minor: 2700,
      currency: "BRL",
    },
    {
      sku: "synthetic-second",
      name: "Synthetic credit",
      amount_minor: 5000,
      provider_cost_minor: 5400,
      currency: "BRL",
    },
  ]);
  expect(
    transport.mock.calls.map(([url]) => new URL(String(url)).pathname),
  ).toEqual(["/api/authentication/login", "/api/products/synthetic-api-token"]);
  expect(process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED).toBe("false");
  expect(emailGiftPurchasesConfigured()).toBe(false);
});

test("keeps fixed BRL and optional cost compatible with the catalog-only mapping", async () => {
  process.env.GIFT_CARD_PROVIDER_RESPONSE_MAPPING = JSON.stringify({
    ...mapping,
    currency: undefined,
    cost: undefined,
    fixed_currency: "BRL",
  });
  const { provider } = catalog([
    parent("synthetic-fixed", [{ options: { credit: "25.10" } }]),
  ]);
  expect(await provider.products()).toEqual([
    {
      sku: "synthetic-fixed",
      name: "Synthetic credit",
      amount_minor: 2510,
      provider_cost_minor: null,
      currency: "BRL",
    },
  ]);
});

test.each([
  undefined,
  null,
  {},
  [null],
  [25],
  [[25]],
  [{ options: { credit: 25 } }],
  [{ options: { credit: "25,00", cost: 27 } }],
  [option(0, 1)],
])("rejects malformed variants atomically: %j", async (variants) => {
  const { provider } = catalog([
    parent("synthetic-valid", [option()]),
    parent("synthetic-invalid", variants),
  ]);
  await expect(provider.products()).rejects.toMatchObject({
    category: "INVALID_CONTRACT",
  });
});

test("rejects an entirely empty normalized catalog", async () => {
  await expect(
    catalog([parent("synthetic-empty", [])]).provider.products(),
  ).rejects.toMatchObject({ category: "INVALID_CONTRACT" });
});

test.each([
  [parent("synthetic-duplicate", [option(), option(25, 29)])],
  [
    parent("synthetic-duplicate", [option()]),
    parent("synthetic-duplicate", [option()]),
  ],
])(
  "rejects duplicate SKU and nominal value across all variants",
  async (...items) => {
    const { provider } = catalog(items);
    await expect(provider.products()).rejects.toMatchObject({
      category: "INVALID_CONTRACT",
    });
  },
);

test("accepts the maximum normalized catalog size", async () => {
  const { provider } = catalog([
    parent(
      "synthetic-boundary",
      Array.from({ length: 10000 }, (_, index) => option(index + 1, index + 1)),
    ),
  ]);
  expect(await provider.products()).toHaveLength(10000);
});

test.each([
  [
    parent(
      "synthetic-large",
      Array.from({ length: 10001 }, (_, index) => option(index + 1)),
    ),
  ],
  [
    parent(
      "synthetic-a",
      Array.from({ length: 6000 }, (_, index) => option(index + 1)),
    ),
    parent(
      "synthetic-b",
      Array.from({ length: 4001 }, (_, index) => option(index + 1)),
    ),
  ],
  Array.from({ length: 10001 }, (_, index) => parent(`synthetic-${index}`, [])),
])(
  "rejects catalogs beyond the parent or flattened variant limit",
  async (...items) => {
    await expect(catalog(items).provider.products()).rejects.toMatchObject({
      category: "INVALID_CONTRACT",
    });
  },
);

test.each(["false", "true"])(
  "the catalog-only client exposes no fulfillment capability with attestation %s",
  (attestation) => {
    process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED = attestation;
    const transport = jest.fn();
    const provider = createEmailGiftCatalogProvider({ transport });
    expect(Object.keys(provider)).toEqual(["products"]);
    expect(Object.isFrozen(provider)).toBe(true);
    const unsafe = provider as unknown as EmailGiftProvider;
    expect(() => unsafe.submit(request)).toThrow(TypeError);
    expect(() => unsafe.track("synthetic-order")).toThrow(TypeError);
    expect(transport).not.toHaveBeenCalled();
  },
);

test.each([
  ["GIFT_CARD_PROVIDER_BASE_URL", "http://supplier.example.test"],
  ["GIFT_CARD_PROVIDER_ENVIRONMENT", "production"],
  ["GIFT_CARD_PROVIDER_USERNAME", ""],
  ["GIFT_CARD_PROVIDER_PASSWORD", ""],
  ["GIFT_CARD_PROVIDER_RESPONSE_MAPPING", "{}"],
])("catalog-only access still validates %s", (key, value) => {
  process.env[key] = value;
  expect(() =>
    createEmailGiftCatalogProvider({ transport: jest.fn() }),
  ).toThrow("configuration requires verification");
});

test("the full factory cannot be narrowed into catalog-only mode by an unsafe options cast", () => {
  const options = { transport: jest.fn(), catalogOnly: true };
  expect(() => createEmailGiftProvider(options)).toThrow(
    "configuration requires verification",
  );
});

test("catalog-only endpoint restrictions apply after URL normalization", async () => {
  process.env.GIFT_CARD_PROVIDER_API_TOKEN = "..";
  const transport = jest.fn().mockResolvedValueOnce(login());
  await expect(
    createEmailGiftCatalogProvider({ transport }).products(),
  ).rejects.toMatchObject({ category: "CATALOG_ONLY" });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(new URL(String(transport.mock.calls[0][0])).pathname).toBe(
    "/api/authentication/login",
  );
});

test.each(["submit", "track"])(
  "revoking attestation while authenticating prevents the subsequent %s request",
  async (method) => {
    fullConfiguration();
    const transport = jest.fn().mockImplementationOnce(async () => {
      process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED = "false";
      return login();
    });
    const provider = createEmailGiftProvider({ transport });
    await expect(
      method === "submit"
        ? provider.submit(request)
        : provider.track("synthetic-order"),
    ).rejects.toThrow("configuration requires verification");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(new URL(String(transport.mock.calls[0][0])).pathname).toBe(
      "/api/authentication/login",
    );
  },
);

test("revoking attestation blocks the cached full accessor and captured client even with a cached bearer", async () => {
  fullConfiguration();
  const transport = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      json({ reference: "synthetic-reference", state: 1 }),
    );
  const provider = emailGiftProvider();
  expect(emailGiftProvider()).toBe(provider);
  await provider.track("synthetic-order");
  expect(transport).toHaveBeenCalledTimes(2);
  process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED = "false";
  expect(() => emailGiftProvider()).toThrow(
    "configuration requires verification",
  );
  await expect(provider.submit(request)).rejects.toThrow(
    "configuration requires verification",
  );
  await expect(provider.track("synthetic-order")).rejects.toThrow(
    "configuration requires verification",
  );
  await expect(provider.products()).rejects.toThrow(
    "configuration requires verification",
  );
  expect(transport).toHaveBeenCalledTimes(2);
});
