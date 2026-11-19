import handler from "pages/api/v1/appmax/health";
import { prisma } from "infra/database";
import { apiRequest } from "tests/fixtures/api_request";

jest.mock("infra/database", () => ({
  prisma: { paymentInstallation: { upsert: jest.fn(), create: jest.fn() } },
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
  expect(prisma.paymentInstallation.upsert).not.toHaveBeenCalled();
  expect(prisma.paymentInstallation.create).not.toHaveBeenCalled();
  expect(errorLog).not.toHaveBeenCalled();
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
