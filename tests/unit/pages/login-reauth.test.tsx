/** @jest-environment jsdom */
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import LoginPage from "pages/login";

const mockFetch = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockRouter: {
  isReady: boolean;
  query: { verifyEmail?: string; callbackUrl?: string };
  push: typeof mockPush;
  replace: typeof mockReplace;
} = { isReady: true, query: {}, push: mockPush, replace: mockReplace };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("lib/product-events-client", () => ({
  acceptProductEventContext: jest.fn(),
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    t: (value: string) => value,
    translateError: (value: string, fallback: string) => value || fallback,
  }),
}));

let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.isReady = true;
  mockRouter.query = { callbackUrl: "/store/club/selections/spring" };
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = mockFetch;
  mockFetch.mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

test("email proof reauthentication presents the existing OTP form even with a valid session", async () => {
  mockRouter.query.verifyEmail = "1";
  await act(async () => root.render(<LoginPage />));
  expect(container.querySelector("form")).not.toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockFetch).not.toHaveBeenCalled();
});

test("normal login keeps its existing authenticated return behavior", async () => {
  await act(async () => root.render(<LoginPage />));
  expect(mockFetch).toHaveBeenCalledWith("/api/v1/user");
  expect(mockReplace).toHaveBeenCalledWith("/store/club/selections/spring");
});

test.each([
  "https://elsewhere.example",
  "//elsewhere.example",
  "/\\elsewhere.example",
])("login rejects an external return location %s", async (callbackUrl) => {
  mockRouter.query.callbackUrl = callbackUrl;
  await act(async () => root.render(<LoginPage />));
  expect(mockReplace).toHaveBeenCalledWith("/store");
});

test("the session check waits until query parameters are ready", async () => {
  mockRouter.isReady = false;
  await act(async () => root.render(<LoginPage />));
  expect(mockFetch).not.toHaveBeenCalled();
  mockRouter.isReady = true;
  mockRouter.query.verifyEmail = "1";
  await act(async () => root.render(<LoginPage />));
  expect(container.querySelector("form")).not.toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});
