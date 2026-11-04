import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import controller from "infra/controller";
import { createRun, runSummary, resumeRun } from "models/price_refresh";
import {
  dispatchPriceRefresh,
  priceExecutorConfigured,
} from "infra/price_refresh_dispatch";
import auditLog from "models/audit_log";
jest.mock("models/price_refresh", () => ({
  createRun: jest.fn(),
  runSummary: jest.fn(),
  resumeRun: jest.fn(),
}));
jest.mock("infra/price_refresh_dispatch", () => ({
  dispatchPriceRefresh: jest.fn(),
  priceExecutorConfigured: jest.fn(() => true),
}));
jest.mock("models/audit_log", () => ({
  __esModule: true,
  default: { record: jest.fn() },
}));

let startHandler, detailHandler, resumeHandler;
beforeAll(async () => {
  jest
    .spyOn(controller, "injectAnonymousOrUser")
    .mockImplementation((_req, _res, next) => next());
  startHandler = (await import("pages/api/v1/backoffice/price-refresh/index"))
    .default;
  detailHandler = (
    await import("pages/api/v1/backoffice/price-refresh/[id]/index")
  ).default;
  resumeHandler = (
    await import("pages/api/v1/backoffice/price-refresh/[id]/resume/index")
  ).default;
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(priceExecutorConfigured).mockReturnValue(true);
});
afterAll(() => jest.restoreAllMocks());
function req(method: string, features: string[], body = {}, query = {}) {
  return {
    method,
    url: "/api/v1/backoffice/price-refresh",
    body,
    query,
    context: { user: { id: randomUUID(), features } },
  } as unknown as NextApiRequest;
}
function res() {
  const response = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as typeof response & NextApiResponse;
}
test("anonymous and non-admin users cannot start, inspect or resume", async () => {
  for (const features of [[], ["import:steam_game"]]) {
    for (const [handler, method] of [
      [startHandler, "POST"],
      [detailHandler, "GET"],
      [resumeHandler, "POST"],
    ]) {
      const response = res();
      await handler(req(method, features), response);
      expect(response.status).toHaveBeenCalledWith(403);
    }
  }
  expect(createRun).not.toHaveBeenCalled();
  expect(resumeRun).not.toHaveBeenCalled();
});
test("admin creates once, dispatches and audits; duplicate request doesn't dispatch", async () => {
  const id = randomUUID();
  jest
    .mocked(createRun)
    .mockResolvedValue({ run: { id }, created: true } as never);
  jest.mocked(runSummary).mockResolvedValue({ id, status: "QUEUED" } as never);
  const response = res();
  await startHandler(
    req("POST", ["update:game:status:any"], { provider: "NINTENDO" }),
    response,
  );
  expect(response.status).toHaveBeenCalledWith(202);
  expect(dispatchPriceRefresh).toHaveBeenCalledWith(id);
  expect(auditLog.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: "price_refresh:start" }),
  );
  jest
    .mocked(createRun)
    .mockResolvedValue({ run: { id }, created: false } as never);
  await startHandler(req("POST", ["update:game:status:any"]), res());
  expect(dispatchPriceRefresh).toHaveBeenCalledTimes(1);
});
test("unconfigured executor and arbitrary input are rejected before any run", async () => {
  const invalid = res();
  await startHandler(
    req("POST", ["update:game:status:any"], { ref: "arbitrary-branch" }),
    invalid,
  );
  expect(invalid.status).toHaveBeenCalledWith(400);
  expect(createRun).not.toHaveBeenCalled();
  jest.mocked(priceExecutorConfigured).mockReturnValue(false);
  const unavailable = res();
  await startHandler(req("POST", ["update:game:status:any"]), unavailable);
  expect(unavailable.status).toHaveBeenCalledWith(503);
  expect(createRun).not.toHaveBeenCalled();
});
