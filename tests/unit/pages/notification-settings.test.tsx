/** @jest-environment jsdom */
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import NotificationSettings from "pages/settings/notifications";
import Unsubscribe from "pages/notifications/unsubscribe/[token]";
import { ApiClientError } from "lib/api-client";

const mockSWR = jest.fn();
const mockMutate = jest.fn();
const mockFetch = jest.fn();
const mockRouter = {
  asPath: "/settings/notifications",
  query: { token: "x".repeat(64) },
  push: jest.fn(),
};
jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSWR(...args),
}));
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("components/store/StoreHomeLayout", () => ({
  StoreHomeLayout: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("components/store/OutletNotificationButton", () => ({
  OutletNotificationButton: () => <button>Outlet bell</button>,
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ locale: "pt-BR", t: (value: string) => value }),
}));

let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = mockFetch;
  window.history.replaceState(null, "", "/");
  mockMutate.mockResolvedValue(undefined);
  mockSWR.mockImplementation((url: string) => ({
    data:
      url === "/api/v1/user"
        ? { id: "reader" }
        : url.endsWith("notification-preferences")
          ? { email_locale: "en", has_preference: true }
          : { email_locale: "en", subscriptions: [] },
    mutate: mockMutate,
  }));
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

test("opening preferences in Portuguese retains the saved English email language", async () => {
  act(() => root.render(<NotificationSettings />));
  expect(container.querySelector("select")?.value).toBe("en");
  expect(mockFetch).not.toHaveBeenCalled();
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "pt-BR";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ email_locale: "pt-BR", has_preference: true }),
  });
  await act(async () => container.querySelector("button")!.click());
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/v1/user/notification-preferences",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ email_locale: "pt-BR" }),
    }),
  );
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Preferences saved",
  );
});

test("private preferences show login instead of account data to a visitor", () => {
  mockSWR.mockReturnValue({ error: new ApiClientError(401, "Not logged in") });
  act(() => root.render(<NotificationSettings />));
  expect(container.querySelector("select")).toBeNull();
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
  );
});

test("opening an unsubscribe link performs no mutation until explicit confirmation", async () => {
  act(() => root.render(<Unsubscribe />));
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ unsubscribed: true }),
  });
  await act(async () => container.querySelector("button")!.click());
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/v1/notifications/unsubscribe",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ token: mockRouter.query.token }),
    }),
  );
  expect(container.textContent).toContain("Email notifications disabled");
  expect(container.querySelector("button")).toBeNull();
});

test("an invalid unsubscribe token offers recovery without disclosing account details", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: "Private account detail" }),
  });
  act(() => root.render(<Unsubscribe />));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not unsubscribe. Try again or manage your preferences.",
  );
  expect(container.textContent).not.toContain("Private account detail");
});

test("new email links keep their capability in a browser-only fragment until explicit POST", async () => {
  const token = "fragment-capability-".repeat(4);
  window.history.replaceState(
    null,
    "",
    `/notifications/unsubscribe#token=${encodeURIComponent(token)}`,
  );
  act(() => root.render(<Unsubscribe />));
  expect(mockFetch).not.toHaveBeenCalled();
  expect(container.innerHTML).not.toContain(token);
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ unsubscribed: true }),
  });
  await act(async () => container.querySelector("button")!.click());
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/v1/notifications/unsubscribe",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  );
  expect(window.location.hash).toBe("");
  expect(container.textContent).toContain("Email notifications disabled");
});
