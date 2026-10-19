import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { NextApiRequest, NextApiResponse } from "next";
import webhook from "pages/api/webhooks/resend";
import recover from "pages/api/internal/selection-emails/recover";
import {
  handleSelectionEmailWebhook,
  recoverSelectionEmails,
} from "models/selection_email";

jest.mock("models/selection_email", () => ({
  handleSelectionEmailWebhook: jest.fn(),
  recoverSelectionEmails: jest.fn(),
}));

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`;
  process.env.CRON_SECRET = "test-cron-secret";
});
afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

function response() {
  const state = { status: 0, body: null as unknown };
  const res = {
    setHeader: jest.fn(),
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res: res as unknown as NextApiResponse, state };
}

function request(
  body: string,
  options: {
    signBody?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {},
) {
  const id = "msg_test_event";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", "test-webhook-secret")
    .update(`${id}.${timestamp}.${options.signBody ?? body}`)
    .digest("base64");
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, {
    method: options.method ?? "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
      ...options.headers,
    },
  });
  return req as unknown as NextApiRequest;
}

test("authenticates the raw webhook before forwarding the signed event and durable ID", async () => {
  const event = {
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: "provider-email-id", to: ["private@example.com"] },
  };
  const { res, state } = response();
  await webhook(request(JSON.stringify(event)), res);
  expect(state.status).toBe(200);
  expect(handleSelectionEmailWebhook).toHaveBeenCalledWith(
    event,
    "msg_test_event",
  );
});

test("rejects tampered body, missing signature, oversized body, and wrong method without processing", async () => {
  const cases = [
    {
      req: request('{"type":"email.complained"}', {
        signBody: '{"type":"email.delivered"}',
      }),
      status: 400,
    },
    { req: request("{}", { headers: { "svix-signature": "" } }), status: 400 },
    { req: request("x".repeat(256 * 1024 + 1)), status: 413 },
    { req: request("{}", { method: "GET" }), status: 405 },
  ];
  for (const item of cases) {
    const { res, state } = response();
    await webhook(item.req, res);
    expect(state.status).toBe(item.status);
  }
  expect(handleSelectionEmailWebhook).not.toHaveBeenCalled();
});

test("fails closed without the signing secret and retries a valid event when processing fails", async () => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  let result = response();
  await webhook(request("{}"), result.res);
  expect(result.state.status).toBe(503);
  expect(handleSelectionEmailWebhook).not.toHaveBeenCalled();
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`;
  jest
    .mocked(handleSelectionEmailWebhook)
    .mockRejectedValueOnce(new Error("private provider detail"));
  result = response();
  await webhook(request('{"type":"email.delivered"}'), result.res);
  expect(result.state.status).toBe(503);
  expect(JSON.stringify(result.state.body)).not.toContain("private");
});

test("recovery rejects missing/wrong bearer and non-GET requests", async () => {
  for (const options of [
    { method: "GET", authorization: undefined, status: 401 },
    { method: "GET", authorization: "Bearer wrong", status: 401 },
    { method: "POST", authorization: "Bearer test-cron-secret", status: 405 },
  ]) {
    const { res, state } = response();
    await recover(
      {
        method: options.method,
        headers: { authorization: options.authorization },
      } as NextApiRequest,
      res,
    );
    expect(state.status).toBe(options.status);
  }
  expect(recoverSelectionEmails).not.toHaveBeenCalled();
});

test("authorized recovery returns only model summary", async () => {
  jest
    .mocked(recoverSelectionEmails)
    .mockResolvedValueOnce({ events: 2, batches: 4 });
  const { res, state } = response();
  await recover(
    {
      method: "GET",
      headers: { authorization: "Bearer test-cron-secret" },
    } as NextApiRequest,
    res,
  );
  expect(state).toEqual({ status: 200, body: { events: 2, batches: 4 } });
});
