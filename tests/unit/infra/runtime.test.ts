import { assertSandbox, giftCardsEnabled, sandboxEnabled } from "infra/runtime";

const environment = { ...process.env };
afterEach(() => {
  process.env = { ...environment };
});

test.each(["development", "test"] as const)(
  "retains local sandbox behavior in %s",
  (NODE_ENV) => {
    process.env = { ...environment, NODE_ENV };
    delete process.env.PAYMENT_ENVIRONMENT;
    expect(sandboxEnabled()).toBe(true);
  },
);

test("a hosted build requires explicit homologation and purchase opt-in", () => {
  process.env = {
    ...environment,
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
  };
  delete process.env.APP_ENV;
  delete process.env.PURCHASES_ENABLED;
  expect(sandboxEnabled()).toBe(false);
  process.env.APP_ENV = "hml";
  expect(sandboxEnabled()).toBe(false);
  process.env.PURCHASES_ENABLED = "true";
  expect(giftCardsEnabled()).toBe(false);
  process.env.GIFT_CARD_PROVIDER = "api";
  expect(giftCardsEnabled()).toBe(true);
  expect(() => assertSandbox()).not.toThrow();
});

test("live payment configuration remains blocked even with homologation opt-in", () => {
  process.env = {
    ...environment,
    NODE_ENV: "production",
    APP_ENV: "hml",
    PURCHASES_ENABLED: "true",
    PAYMENT_ENVIRONMENT: "production",
  };
  expect(sandboxEnabled()).toBe(false);
  expect(() => assertSandbox()).toThrow("Purchases are unavailable.");
});
