import {
  authorizeAppstoreInstallation,
  generateAppstoreMerchant,
  getAppstoreAccessToken,
  verifyAppstoreMerchantQuote,
} from "infra/payments/appmax-appstore-client";
import {
  findAppmaxInstallation,
  merchantCredentialDigest,
  stageAppmaxInstallation,
} from "models/appmax_installation";
import handler from "pages/api/v1/appmax/installation";
import { apiRequest } from "tests/fixtures/api_request";

jest.mock("infra/payments/appmax-appstore-client", () => ({
  authorizeAppstoreInstallation: jest.fn(),
  generateAppstoreMerchant: jest.fn(),
  getAppstoreAccessToken: jest.fn(),
  verifyAppstoreMerchantQuote: jest.fn(),
}));

jest.mock("models/appmax_installation", () => ({
  ...jest.requireActual<typeof import("models/appmax_installation")>(
    "models/appmax_installation",
  ),
  findAppmaxInstallation: jest.fn(),
  merchantCredentialDigest: jest.fn(),
  stageAppmaxInstallation: jest.fn(),
}));

const environment = { ...process.env };
const url = "/api/v1/appmax/installation";
const previewOrigin = "https://checkout-preview.example";
const appId = "2f590e48-b930-4a49-a692-13e89fabc112";
const operatorToken = "test-operator-token_with-at-least-32-characters";
const authorizationToken = "synthetic_appmax_authorization_token_0123456789";
const appCreds = {
  client_id: "fixture-appstore-client-id",
  client_secret: "fixture-appstore-client-secret",
};
const merchant = {
  client_id: "fixture-merchant-client-id",
  client_secret: "fixture-merchant-client-secret",
};
const applicationAccessToken = "fixture-app-access-token";
const merchantAccessToken = "fixture-merchant-access-token";
const externalId = "790a41b2-c8d5-498b-a633-ba5ef098d5a7";
const digest = "f".repeat(64);
const quote = [
  { installments: 1, total_minor: 5000 },
  { installments: 2, total_minor: 5170 },
];

const authorization = `Bearer ${operatorToken}`;
const authorize = { action: "authorize" };
const complete = {
  action: "complete",
  token: authorizationToken,
  amount_cents: 5000,
};

function post(body: unknown, header = authorization) {
  return apiRequest(handler, {
    url,
    body,
    headers: { authorization: header },
  });
}

function arrangeSuccessfulCompletion() {
  jest
    .mocked(findAppmaxInstallation)
    .mockResolvedValueOnce({ external_id: null, credential_digest: null })
    .mockResolvedValueOnce({
      external_id: externalId,
      credential_digest: digest,
    });
  jest.mocked(generateAppstoreMerchant).mockResolvedValue(merchant);
  jest.mocked(merchantCredentialDigest).mockReturnValue(digest);
  jest
    .mocked(getAppstoreAccessToken)
    .mockResolvedValueOnce(applicationAccessToken)
    .mockResolvedValueOnce(merchantAccessToken);
  jest.mocked(verifyAppstoreMerchantQuote).mockResolvedValue(quote);
}

beforeEach(() => {
  Object.assign(process.env, {
    APP_ENV: "hml",
    VERCEL_ENV: "preview",
    PURCHASES_ENABLED: "true",
    PAYMENT_ENVIRONMENT: "sandbox",
    POSTGRES_DB: "homolog",
    MANIFOLD_PREVIEW_ORIGIN: previewOrigin,
    APPMAX_APPSTORE_APP_ID: appId,
    APPMAX_APPSTORE_CLIENT_ID: appCreds.client_id,
    APPMAX_APPSTORE_CLIENT_SECRET: appCreds.client_secret,
    APPMAX_APPSTORE_INSTALL_OPERATOR_TOKEN: operatorToken,
    APPMAX_CLIENT_ID: "fixture-fallback-id",
    APPMAX_CLIENT_SECRET: "fixture-fallback-secret",
  });
  delete process.env.VERCEL_BRANCH_URL;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
  process.env = { ...environment };
});

test("does not accept an unrecognized installation callback", async () => {
  jest.mocked(findAppmaxInstallation).mockResolvedValue(null);
  const response = await apiRequest(handler, {
    url,
    method: "GET",
    query: { token: authorizationToken },
  });

  expect(response.status).toBe(404);
  expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(getAppstoreAccessToken).not.toHaveBeenCalled();
});

test.each(["", "Basic fixture", "Bearer invalid"])(
  "keeps the installation unavailable with authorization %j",
  async (header) => {
    const response = await post(authorize, header);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      name: "NotFoundError",
      status_code: 404,
    });
    expect(getAppstoreAccessToken).not.toHaveBeenCalled();
    expect(stageAppmaxInstallation).not.toHaveBeenCalled();
  },
);

test.each([
  ["APP_ENV", "production"],
  ["VERCEL_ENV", "production"],
  ["PAYMENT_ENVIRONMENT", "production"],
  ["POSTGRES_DB", "production"],
  ["APPMAX_APPSTORE_INSTALL_OPERATOR_TOKEN", "short"],
])("keeps the installation unavailable when %s is %j", async (key, value) => {
  process.env[key] = value;
  const response = await post(authorize);

  expect(response.status).toBe(404);
  expect(getAppstoreAccessToken).not.toHaveBeenCalled();
  expect(stageAppmaxInstallation).not.toHaveBeenCalled();
});

test.each([
  {},
  { ...complete, amount_cents: 0 },
  { ...complete, amount_cents: 50.01 },
  { ...complete, token: "https://other.example/opaque" },
])("rejects invalid installation input %j", async (body) => {
  const response = await post(body);

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    name: "ValidationError",
    status_code: 400,
  });
  expect(findAppmaxInstallation).not.toHaveBeenCalled();
  expect(getAppstoreAccessToken).not.toHaveBeenCalled();
});

test("authorizes the Appstore app on the sandbox and stages the same challenge", async () => {
  jest.mocked(getAppstoreAccessToken).mockResolvedValue(applicationAccessToken);
  jest
    .mocked(authorizeAppstoreInstallation)
    .mockResolvedValue(authorizationToken);

  const response = await post(authorize);

  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toEqual({
    authorization_url: `https://breakingcode.sandboxappmax.com.br/appstore/integration/${authorizationToken}`,
  });
  expect(getAppstoreAccessToken).toHaveBeenCalledWith(
    appCreds.client_id,
    appCreds.client_secret,
  );
  expect(authorizeAppstoreInstallation).toHaveBeenCalledWith(
    applicationAccessToken,
    appId,
    expect.stringMatching(/^[a-z\d_-]{32,}$/i),
    expect.stringContaining(previewOrigin),
  );
  const [, , externalKey, callback] = jest.mocked(authorizeAppstoreInstallation)
    .mock.calls[0];
  expect(new URL(callback).origin).toBe(previewOrigin);
  expect(stageAppmaxInstallation).toHaveBeenCalledWith(
    externalKey,
    authorizationToken,
  );
  expect(generateAppstoreMerchant).not.toHaveBeenCalled();
});

test("accepts the existing preview credential pair when no Appstore pair is configured", async () => {
  delete process.env.APPMAX_APPSTORE_CLIENT_ID;
  delete process.env.APPMAX_APPSTORE_CLIENT_SECRET;
  jest.mocked(getAppstoreAccessToken).mockResolvedValue(applicationAccessToken);
  jest
    .mocked(authorizeAppstoreInstallation)
    .mockResolvedValue(authorizationToken);

  const response = await post(authorize);

  expect(response.status).toBe(200);
  expect(getAppstoreAccessToken).toHaveBeenCalledWith(
    "fixture-fallback-id",
    "fixture-fallback-secret",
  );
});

test("rejects a mixed credential pair before contacting the sandbox", async () => {
  delete process.env.APPMAX_APPSTORE_CLIENT_SECRET;

  const response = await post(authorize);

  expect(response.status).toBe(404);
  expect(getAppstoreAccessToken).not.toHaveBeenCalled();
});

test("does not send a non-HTTPS callback origin to the sandbox", async () => {
  process.env.MANIFOLD_PREVIEW_ORIGIN = "http://checkout-preview.example";

  const response = await post(authorize);

  expect(response.status).toBe(404);
  expect(authorizeAppstoreInstallation).not.toHaveBeenCalled();
});

test("does not send an unknown approval token to the sandbox", async () => {
  jest.mocked(findAppmaxInstallation).mockResolvedValue(null);

  const response = await post(complete);

  expect(response.status).toBe(404);
  expect(findAppmaxInstallation).toHaveBeenCalledWith(authorizationToken);
  expect(generateAppstoreMerchant).not.toHaveBeenCalled();
  expect(verifyAppstoreMerchantQuote).not.toHaveBeenCalled();
});

test("returns the exact staged External ID after authenticating and quoting as the merchant", async () => {
  arrangeSuccessfulCompletion();

  const response = await post(complete);

  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toEqual({
    external_id: externalId,
    ...merchant,
    quote,
  });
  expect(findAppmaxInstallation).toHaveBeenCalledTimes(2);
  expect(generateAppstoreMerchant).toHaveBeenCalledWith(
    applicationAccessToken,
    authorizationToken,
  );
  expect(merchantCredentialDigest).toHaveBeenCalledWith(merchant);
  expect(getAppstoreAccessToken).toHaveBeenNthCalledWith(
    2,
    merchant.client_id,
    merchant.client_secret,
  );
  expect(verifyAppstoreMerchantQuote).toHaveBeenCalledWith(
    merchantAccessToken,
    5000,
  );
  expect(stageAppmaxInstallation).not.toHaveBeenCalled();
});

test("withholds a generated credential pair when it differs from what the health check saw", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  arrangeSuccessfulCompletion();
  jest.mocked(merchantCredentialDigest).mockReturnValue("e".repeat(64));

  const response = await post(complete);

  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toContain(merchant.client_secret);
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
    merchant.client_secret,
  );
  expect(verifyAppstoreMerchantQuote).not.toHaveBeenCalled();
});

test("withholds a generated credential pair when the health check did not record an External ID", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  arrangeSuccessfulCompletion();
  jest.mocked(findAppmaxInstallation).mockReset().mockResolvedValue({
    external_id: null,
    credential_digest: null,
  });

  const response = await post(complete);

  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toContain(merchant.client_secret);
  expect(verifyAppstoreMerchantQuote).not.toHaveBeenCalled();
});

test("preserves one-time credentials for the authenticated operator when the independent quote fails", async () => {
  arrangeSuccessfulCompletion();
  jest
    .mocked(verifyAppstoreMerchantQuote)
    .mockRejectedValue(new Error("fixture quote unavailable"));

  const response = await post(complete);

  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toEqual({
    external_id: externalId,
    ...merchant,
    quote: null,
  });
});
