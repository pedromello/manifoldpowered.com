import { createHash } from "node:crypto";
import handler from "pages/api/v1/appmax/health";
import { prisma } from "infra/database";
import {
  findAppmaxInstallation,
  merchantCredentialDigest,
  stageAppmaxInstallation,
} from "models/appmax_installation";
import { apiRequest } from "tests/fixtures/api_request";

const mockTransactionClient = {
  $queryRaw: jest.fn(),
  appmaxInstallationAttempt: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
};
const mockTransaction = jest.fn(
  (query: (tx: typeof mockTransactionClient) => Promise<unknown>) =>
    query(mockTransactionClient),
);

jest.mock("infra/database", () => ({
  prisma: {
    paymentInstallation: { upsert: jest.fn(), create: jest.fn() },
    $transaction: (query: Parameters<typeof mockTransaction>[0]) =>
      mockTransaction(query),
  },
}));

const environment = { ...process.env };
const appId = 123;
const url = "/api/v1/appmax/health";
const uuidV4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

beforeEach(() => {
  process.env.VERCEL_ENV = "preview";
  process.env.PAYMENT_ENVIRONMENT = "sandbox";
  process.env.APPMAX_APPSTORE_NUMERIC_ID = String(appId);
  process.env.APP_ENV = "hml";
  process.env.POSTGRES_DB = "homolog";
  mockTransactionClient.$queryRaw.mockResolvedValue([{ name: "homolog" }]);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  process.env = { ...environment };
});

test("the Appstore validation returns a fresh UUID and leaves checkout settings alone", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  const demoBody = {
    app_id: "DEMO_APP_ID",
    client_id: "DEMO_CLIENT_ID",
    client_secret: "DEMO_CLIENT_SECRET",
    client_key: "DEMO_EXTERNAL_KEY",
    external_key: "DEMO_EXTERNAL_KEY",
  };
  const payloads = [
    demoBody,
    { ...demoBody, external_key: null },
    { app_id: appId },
  ];
  const ids = new Set<string>();
  for (const body of payloads) {
    const result = await apiRequest<{ external_id: string }>(handler, {
      url,
      body,
    });
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).toEqual({ external_id: expect.stringMatching(uuidV4) });
    ids.add(result.body.external_id);
  }
  expect(ids.size).toBe(payloads.length);
  expect(mockTransaction).not.toHaveBeenCalled();
  expect(prisma.paymentInstallation.upsert).not.toHaveBeenCalled();
  expect(prisma.paymentInstallation.create).not.toHaveBeenCalled();
  expect(errorLog).not.toHaveBeenCalled();
});

describe("staging an actual Appmax sandbox installation", () => {
  const externalKey = "A".repeat(43);
  const token = "synthetic-authorized-appmax-token";
  const merchant = {
    client_id: "synthetic-merchant-id",
    client_secret: "synthetic-merchant-secret",
  };
  const attempts = mockTransactionClient.appmaxInstallationAttempt;
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");

  test("stages only digests and captures the UUID for the same pending attempt", async () => {
    await stageAppmaxInstallation(externalKey, token);

    expect(attempts.create).toHaveBeenCalledWith({
      data: {
        external_key_hash: hash(externalKey),
        authorization_token_hash: hash(token),
        expires_at: expect.any(Date),
      },
    });

    attempts.findFirst.mockImplementationOnce(async () => ({
      external_id: attempts.updateMany.mock.calls[0][0].data.external_id,
    }));
    const result = await apiRequest<{ external_id: string }>(handler, {
      url,
      body: { app_id: appId, external_key: externalKey, ...merchant },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ external_id: expect.stringMatching(uuidV4) });
    const credentialDigest = merchantCredentialDigest(merchant);
    expect(attempts.updateMany).toHaveBeenCalledWith({
      where: {
        external_key_hash: hash(externalKey),
        expires_at: { gt: expect.any(Date) },
        external_id: null,
      },
      data: {
        external_id: result.body.external_id,
        credential_digest: credentialDigest,
      },
    });

    const captured = {
      external_id: result.body.external_id,
      credential_digest: credentialDigest,
    };
    attempts.findFirst.mockResolvedValueOnce(captured);
    await expect(findAppmaxInstallation(token)).resolves.toEqual(captured);
    expect(attempts.findFirst).toHaveBeenLastCalledWith({
      where: {
        authorization_token_hash: hash(token),
        expires_at: { gt: expect.any(Date) },
      },
      select: { external_id: true, credential_digest: true },
    });
    expect(prisma.paymentInstallation.upsert).not.toHaveBeenCalled();
  });

  test("accepts the client_key alias without credentials", async () => {
    const capturedId = "654ae100-cfe0-48fb-abb4-cdc20686b1f1";
    attempts.findFirst.mockResolvedValueOnce({ external_id: capturedId });

    const result = await apiRequest(handler, {
      url,
      body: { app_id: appId, client_key: externalKey },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ external_id: capturedId });
    expect(attempts.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          external_id: expect.stringMatching(uuidV4),
          credential_digest: null,
        },
      }),
    );
  });

  test("does not read or write staging when the configured database is not homolog", async () => {
    process.env.POSTGRES_DB = "another_database";
    const result = await apiRequest(handler, {
      url,
      body: { app_id: appId, external_key: externalKey, ...merchant },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ external_id: expect.stringMatching(uuidV4) });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test("verifies the connected database before writing staging", async () => {
    mockTransactionClient.$queryRaw.mockResolvedValueOnce([
      { name: "another_database" },
    ]);

    await expect(stageAppmaxInstallation(externalKey, token)).rejects.toThrow(
      "Appmax installation staging is unavailable.",
    );
    expect(attempts.create).not.toHaveBeenCalled();
    expect(attempts.deleteMany).not.toHaveBeenCalled();
  });
});

test.each([{}, { app_id: appId + 1 }, { app_id: String(appId) }])(
  "rejects invalid Appstore health check input %j without exposing submitted data",
  async (body) => {
    const result = await apiRequest(handler, { url, body });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      message: "Invalid Appmax installation validation request.",
      name: "ValidationError",
      action: "Check the Appmax numerical application ID.",
      status_code: 400,
    });
  },
);

test.each([
  ["VERCEL_ENV", "production"],
  ["PAYMENT_ENVIRONMENT", "production"],
  ["APPMAX_APPSTORE_NUMERIC_ID", "invalid"],
])("disables Appstore validation when %s is %s", async (key, value) => {
  process.env[key] = value;
  const result = await apiRequest(handler, { url, body: { app_id: appId } });
  expect(result.status).toBe(404);
  expect(result.body).toEqual({
    message: "Appmax installation validation is unavailable.",
    name: "NotFoundError",
    action: "Check the sandbox validation URL and try again.",
    status_code: 404,
  });
});
