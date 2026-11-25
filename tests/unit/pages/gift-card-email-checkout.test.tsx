/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import GiftCardEmailCheckout from "pages/checkout/gift-card";

const mockRouter = {
  pathname: "/checkout/gift-card",
  query: {} as Record<string, string>,
  isReady: true,
  replace: jest.fn(),
};
const mockFetch = jest.fn();
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
jest.mock("components/store/GiftCardArtwork", () => ({
  GiftCardArtwork: () => null,
}));
jest.mock("components/store/StoreHomeLayout", () => ({
  StoreHomeLayout: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("models/gift_card_catalog", () => ({
  giftCardCheckoutAvailable: () => true,
  giftCardProducts: () => [],
}));

const product = {
  code: "sandbox-brl-25",
  name: "Gift card de teste",
  amount_minor: 2500,
  currency: "BRL",
};
const emailAddress = "comprador@example.test";
const maskedEmail = "c***@example.test";
const challengeId = "385edc37-b27a-42a3-852a-3fc61657ff1c";
const resentChallengeId = "bb931122-2a58-4b54-91b5-2891dea21f91";
const checkoutUrl = "/checkout/6c245588-3205-4c49-b405-02bbe6f59a1d";
const originalFetch = globalThis.fetch;
let root: Root;
let container: HTMLDivElement;

function reply(status: number, body: object, retryAfter?: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => retryAfter?.toString() ?? null },
  };
}

function sent(id = challengeId) {
  return reply(202, {
    challenge_id: id,
    retry_after: 45,
    masked_email: maskedEmail,
  });
}

function input(selector: string) {
  return container.querySelector<HTMLInputElement>(selector)!;
}

function fill(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(label: string) {
  return [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  )!;
}

async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function reloadPage() {
  act(() => root.unmount());
  root = createRoot(container);
  act(() =>
    root.render(<GiftCardEmailCheckout product={product} checkoutAvailable />),
  );
}

function finishCooldownAndReload() {
  const key = `gift-card-checkout:${mockRouter.query.intent}`;
  const stored = JSON.parse(sessionStorage.getItem(key)!);
  sessionStorage.setItem(
    key,
    JSON.stringify({ ...stored, resendAt: Date.now() - 1000 }),
  );
  reloadPage();
  return key;
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockFetch.mockReset();
  mockRouter.query = { product: product.code };
  mockRouter.replace
    .mockReset()
    .mockImplementation(
      async (next: string | { query: Record<string, string> }) => {
        if (typeof next !== "string") mockRouter.query = next.query;
        return true;
      },
    );
  globalThis.fetch = mockFetch;
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(<GiftCardEmailCheckout product={product} checkoutAvailable />),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

test("a shopper sees the gift card and account terms before one email verification", async () => {
  expect(container.textContent).toContain(product.name);
  expect(container.textContent).toContain("R$25,00");
  expect(container.textContent).toContain(
    "If you don't have an account, we'll create one so you can track your order.",
  );
  expect(container.querySelectorAll("input")).toHaveLength(1);
  mockFetch
    .mockResolvedValueOnce(sent())
    .mockResolvedValueOnce(reply(201, { checkout_url: checkoutUrl }));

  fill(input('[type="email"]'), emailAddress);
  await submit();
  const savedIntent = mockRouter.query.intent;
  expect(savedIntent).toEqual(expect.any(String));
  expect(mockFetch).toHaveBeenNthCalledWith(
    1,
    "/api/v1/checkout/gift-card/email",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: emailAddress,
        product_code: product.code,
        intent_id: savedIntent,
        locale: "en",
      }),
    }),
  );
  const code = input('[autocomplete="one-time-code"]');
  expect(document.activeElement).toBe(code);
  expect(container.textContent).toContain(product.name);
  expect(container.textContent).toContain(maskedEmail);
  expect(container.textContent).not.toContain(emailAddress);

  fill(code, "123 456");
  expect(code.value).toBe("123456");
  await submit();
  expect(mockFetch).toHaveBeenNthCalledWith(
    2,
    "/api/v1/checkout/gift-card/verify",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, code: "123456" }),
    }),
  );
  expect(mockRouter.replace).toHaveBeenLastCalledWith(checkoutUrl);
  expect(sessionStorage.length).toBe(0);
});

test("a shopper can reload and resend to the masked address with one tap", async () => {
  mockFetch
    .mockResolvedValueOnce(sent())
    .mockResolvedValueOnce(sent(resentChallengeId));
  fill(input('[type="email"]'), emailAddress);
  await submit();
  fill(input('[autocomplete="one-time-code"]'), "123456");
  const stored = sessionStorage.getItem(
    `gift-card-checkout:${mockRouter.query.intent}`,
  );
  expect(JSON.parse(stored!)).toEqual({
    id: challengeId,
    maskedEmail,
    product: product.code,
    resendAt: expect.any(Number),
  });
  expect(stored).not.toContain(emailAddress);
  expect(stored).not.toContain("123456");

  reloadPage();
  expect(container.textContent).toContain(maskedEmail);
  expect(container.textContent).not.toContain(emailAddress);
  expect(input('[autocomplete="one-time-code"]').value).toBe("");
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(button("Resend code in 45s").disabled).toBe(true);

  const storageKey = finishCooldownAndReload();
  await act(async () => button("Resend code").click());
  expect(mockFetch).toHaveBeenNthCalledWith(
    2,
    "/api/v1/checkout/gift-card/resend",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, locale: "en" }),
    }),
  );
  expect(container.querySelector('[type="email"]')).toBeNull();
  expect(container.querySelector('[role="status"]').textContent).toBe(
    "New code sent.",
  );
  expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual({
    id: resentChallengeId,
    maskedEmail,
    product: product.code,
    resendAt: expect.any(Number),
  });
});

test("a server resend cooldown survives a reload", async () => {
  mockFetch
    .mockResolvedValueOnce(sent())
    .mockResolvedValueOnce(
      reply(429, { message: "Wait before requesting another code." }, 30),
    );
  fill(input('[type="email"]'), emailAddress);
  await submit();
  finishCooldownAndReload();
  await act(async () => button("Resend code").click());

  expect(container.querySelector('[role="alert"]').textContent).toBe(
    "Wait before requesting another code.",
  );
  reloadPage();
  expect(button("Resend code in 30s").disabled).toBe(true);
  expect(container.textContent).toContain(maskedEmail);
});

test.each([401, 409])(
  "an expired resend challenge returns the shopper to the email field (%s)",
  async (status) => {
    mockFetch
      .mockResolvedValueOnce(sent())
      .mockResolvedValueOnce(
        reply(status, { message: "Invalid or expired checkout code." }),
      );
    fill(input('[type="email"]'), emailAddress);
    await submit();
    finishCooldownAndReload();
    await act(async () => button("Resend code").click());

    expect(document.activeElement).toBe(input('[type="email"]'));
    expect(input('[type="email"]').value).toBe("");
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      "Your checkout session expired. Enter your email again.",
    );
    expect(container.textContent).toContain(product.name);
    expect(sessionStorage.length).toBe(0);
  },
);

test("a rejected code keeps the product and lets the shopper correct the address", async () => {
  mockFetch
    .mockResolvedValueOnce(sent())
    .mockResolvedValueOnce(
      reply(401, { message: "Invalid or expired checkout code." }),
    );
  fill(input('[type="email"]'), emailAddress);
  await submit();
  fill(input('[autocomplete="one-time-code"]'), "123456");
  await submit();

  expect(container.querySelector('[role="alert"]').textContent).toBe(
    "Invalid or expired checkout code.",
  );
  expect(container.textContent).toContain(product.name);
  act(() => button("Change email").click());
  expect(document.activeElement).toBe(input('[type="email"]'));
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("a first-screen email cooldown is visible and does not block correcting a typo", async () => {
  mockFetch.mockResolvedValueOnce(
    reply(429, { message: "Wait before requesting another code." }, 30),
  );
  fill(input('[type="email"]'), emailAddress);
  await submit();

  expect(container.querySelector('[role="alert"]').textContent).toBe(
    "Wait before requesting another code.",
  );
  expect(button("Try again in 30s").disabled).toBe(true);
  fill(input('[type="email"]'), "corrigido@example.test");
  expect(button("Continue with email").disabled).toBe(false);
});

test("a removed gift card stops verification and offers a return to the catalog", async () => {
  mockFetch
    .mockResolvedValueOnce(sent())
    .mockResolvedValueOnce(
      reply(409, { message: "This gift card is no longer available." }),
    );
  fill(input('[type="email"]'), emailAddress);
  await submit();
  fill(input('[autocomplete="one-time-code"]'), "123456");
  await submit();

  expect(container.querySelector('[role="alert"]').textContent).toBe(
    "This gift card is unavailable. Choose another gift card.",
  );
  expect(container.querySelector("form")).toBeNull();
  expect(container.querySelector('a[href="/store/gift-cards"]')).not.toBeNull();
  expect(sessionStorage.length).toBe(0);
});
