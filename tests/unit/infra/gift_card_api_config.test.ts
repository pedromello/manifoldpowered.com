import type { NextApiRequest, NextApiResponse } from "next";
import { createEmailGiftProvider } from "infra/gift_card_api";
import { ServiceError } from "infra/errors";
import controller from "infra/controller";

jest.mock("infra/database", () => ({ prisma: {} }));

const original = { ...process.env };
const mapping = {
  products_path: "items",
  sku: "id",
  name: "label",
  face_value: "credit",
  fixed_currency: "BRL",
  value_unit: "major",
  reference: "reference",
  status: "state",
};
beforeEach(() => {
  Object.assign(process.env, {
    PAYMENT_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_BASE_URL: "https://supplier.example.test",
    GIFT_CARD_PROVIDER_USERNAME: "synthetic-private-user",
    GIFT_CARD_PROVIDER_PASSWORD: "synthetic-private-password",
    GIFT_CARD_PROVIDER_API_TOKEN: "synthetic-private-token",
    GIFT_CARD_PROVIDER_ENVIRONMENT: "sandbox",
    GIFT_CARD_PROVIDER_CONTRACT_VERIFIED: "true",
    GIFT_CARD_PROVIDER_TOKEN_SOURCE: "configured",
    GIFT_CARD_PROVIDER_RESPONSE_MAPPING: JSON.stringify(mapping),
  });
});
afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
});

function configurationError() {
  const transport = jest.fn();
  try {
    createEmailGiftProvider({ transport });
  } catch (error) {
    expect(transport).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(ServiceError);
    return error as ServiceError;
  }
  throw new Error("Expected the configuration to fail closed.");
}

test.each([
  ["GIFT_CARD_PROVIDER_BASE_URL", "not-a-url"],
  ["GIFT_CARD_PROVIDER_BASE_URL", "http://supplier.example.test"],
  [
    "GIFT_CARD_PROVIDER_BASE_URL",
    "https://synthetic-user:synthetic-password@supplier.example.test/private?token=synthetic-private-token#fragment",
  ],
  ["GIFT_CARD_PROVIDER_RESPONSE_MAPPING", "{synthetic-private-invalid-json"],
  [
    "GIFT_CARD_PROVIDER_RESPONSE_MAPPING",
    JSON.stringify({ ...mapping, value_unit: "synthetic-private-unit" }),
  ],
  [
    "GIFT_CARD_PROVIDER_RESPONSE_MAPPING",
    JSON.stringify({ ...mapping, submit_success: "" }),
  ],
  [
    "GIFT_CARD_PROVIDER_RESPONSE_MAPPING",
    JSON.stringify({ ...mapping, tracking_request_id: "" }),
  ],
  ["GIFT_CARD_PROVIDER_CONTRACT_VERIFIED", "TRUE"],
  ["GIFT_CARD_PROVIDER_ENVIRONMENT", "production"],
  ["GIFT_CARD_PROVIDER_USERNAME", ""],
  ["GIFT_CARD_PROVIDER_PASSWORD", ""],
  ["GIFT_CARD_PROVIDER_TOKEN_SOURCE", "synthetic-private-mode"],
  ["GIFT_CARD_PROVIDER_API_TOKEN", ""],
])(
  "identifies only the invalid key %s without retaining its value",
  (key, value) => {
    process.env[key] = value;
    const error = configurationError();
    expect(error.context).toEqual({ invalid_configuration: [key] });
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(key);
    expect(JSON.stringify(error.context)).not.toContain(
      value || "synthetic-private-value",
    );
  },
);

test("reports all missing settings without opening the contract gate or leaking diagnostics to the HTTP response", () => {
  const keys = [
    "GIFT_CARD_PROVIDER_BASE_URL",
    "GIFT_CARD_PROVIDER_RESPONSE_MAPPING",
    "GIFT_CARD_PROVIDER_CONTRACT_VERIFIED",
    "GIFT_CARD_PROVIDER_ENVIRONMENT",
    "GIFT_CARD_PROVIDER_USERNAME",
    "GIFT_CARD_PROVIDER_PASSWORD",
    "GIFT_CARD_PROVIDER_API_TOKEN",
  ];
  for (const key of keys) delete process.env[key];
  const error = configurationError();
  expect(error.context).toEqual({ invalid_configuration: keys });
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  controller.errorHandlers.onError(
    error,
    {
      method: "POST",
      url: "/api/v1/backoffice/gift-cards/sync-catalog",
    } as NextApiRequest,
    response as unknown as NextApiResponse,
  );
  expect(response.status).toHaveBeenCalledWith(503);
  expect(JSON.parse(JSON.stringify(response.json.mock.calls[0][0]))).toEqual({
    message: "Gift card sandbox configuration requires verification.",
    name: "ServiceError",
    action: "Check service availability",
    status_code: 503,
  });
  const logged = JSON.parse(log.mock.calls[0][0]);
  expect(logged.context).toEqual({ invalid_configuration: keys });
  expect(logged.cause).toBeUndefined();
  for (const value of [
    "supplier.example.test",
    "synthetic-private-user",
    "synthetic-private-password",
    "synthetic-private-token",
  ])
    expect(log.mock.calls[0][0]).not.toContain(value);
  expect(process.env.GIFT_CARD_PROVIDER_CONTRACT_VERIFIED).toBeUndefined();
});

test("a login token source needs no configured API token; the default source still requires one", () => {
  delete process.env.GIFT_CARD_PROVIDER_API_TOKEN;
  process.env.GIFT_CARD_PROVIDER_TOKEN_SOURCE = "login";
  const transport = jest.fn();
  expect(() => createEmailGiftProvider({ transport })).not.toThrow();
  expect(transport).not.toHaveBeenCalled();
  delete process.env.GIFT_CARD_PROVIDER_TOKEN_SOURCE;
  expect(configurationError().context).toEqual({
    invalid_configuration: ["GIFT_CARD_PROVIDER_API_TOKEN"],
  });
});
