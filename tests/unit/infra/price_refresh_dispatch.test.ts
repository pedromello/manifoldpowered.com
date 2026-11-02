import { prisma } from "infra/database";
import { dispatchPriceRefresh } from "infra/price_refresh_dispatch";
jest.mock("infra/database", () => ({
  prisma: { priceRefreshRun: { updateMany: jest.fn() } },
}));
const originalFetch = global.fetch;
const originalToken = process.env.PRICE_REFRESH_GITHUB_TOKEN;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.PRICE_REFRESH_GITHUB_TOKEN = "synthetic-test-token";
});
afterAll(() => {
  global.fetch = originalFetch;
  if (originalToken === undefined)
    delete process.env.PRICE_REFRESH_GITHUB_TOKEN;
  else process.env.PRICE_REFRESH_GITHUB_TOKEN = originalToken;
});
test("dispatch uses a fixed repository, branch and workflow", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  expect(await dispatchPriceRefresh("run-id")).toBe(true);
  expect(global.fetch).toHaveBeenCalledWith(
    "https://api.github.com/repos/pedromello/manifoldpowered.com/actions/workflows/price-refresh.yaml/dispatches",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { run_id: "run-id" } }),
    }),
  );
  expect(prisma.priceRefreshRun.updateMany).not.toHaveBeenCalled();
});
test("ambiguous dispatch failure only changes an unclaimed queued run", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("network"));
  expect(await dispatchPriceRefresh("run-id")).toBe(false);
  expect(prisma.priceRefreshRun.updateMany).toHaveBeenCalledWith({
    where: { id: "run-id", status: "QUEUED", lease_token: null },
    data: { status: "DISPATCH_FAILED", error_code: "DISPATCH_FAILED" },
  });
});
test("missing executor does not send an HTTP request", async () => {
  delete process.env.PRICE_REFRESH_GITHUB_TOKEN;
  global.fetch = jest.fn();
  expect(await dispatchPriceRefresh("run-id")).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});
