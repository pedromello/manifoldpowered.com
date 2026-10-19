/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OutletNotificationButton } from "components/store/OutletNotificationButton";
import { ApiClientError } from "lib/api-client";
import type { NotificationStatus } from "contracts/outlet-notifications";

const mockSWR = jest.fn();
const mockPush = jest.fn();
const mockMutate = jest.fn();
const mockGlobalMutate = jest.fn();
const mockFetch = jest.fn();
const mockRouter = {
  asPath: "/store/club/selections/new-games?source=home",
  push: mockPush,
};
jest.mock("swr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSWR(...args),
  useSWRConfig: () => ({ mutate: mockGlobalMutate }),
}));
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
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
  mockMutate.mockResolvedValue(undefined);
  mockGlobalMutate.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  state();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

function state(
  data: NotificationStatus = {
    enabled: false,
    is_followed: false,
    requires_email_login: false,
    available: true,
  },
  userError?: Error,
) {
  mockSWR.mockImplementation((url: string) =>
    url === "/api/v1/user"
      ? {
          data: userError ? undefined : { id: "reader" },
          error: userError,
          mutate: mockMutate,
        }
      : { data, mutate: mockMutate },
  );
}
function render() {
  act(() => root.render(<OutletNotificationButton storeSlug="club" />));
}
async function click() {
  await act(async () => container.querySelector("button")!.click());
}

test("the outlined bell offers a keyboard tooltip without changing the subscription on render", () => {
  render();
  const button = container.querySelector("button")!;
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(button.getAttribute("aria-label")).toBe(
    "Receive new selections by email",
  );
  expect(
    document
      .getElementById(button.getAttribute("aria-describedby")!)
      ?.getAttribute("role"),
  ).toBe("tooltip");
  expect(mockFetch).not.toHaveBeenCalled();
});

test.each([false, true])(
  "a confirmed toggle from enabled=%s updates shared follow and preference caches",
  async (enabled) => {
    state({
      enabled,
      is_followed: true,
      requires_email_login: false,
      available: true,
    });
    const confirmed = {
      enabled: !enabled,
      is_followed: true,
      requires_email_login: false,
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => confirmed });
    render();
    await click();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/stores/club/notifications",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabled: !enabled, locale: "pt-BR" }),
      }),
    );
    expect(mockMutate).toHaveBeenCalledWith(confirmed, { revalidate: false });
    expect(mockGlobalMutate).toHaveBeenCalledWith(
      "/api/v1/store-follows/status?store_slug=club",
      { is_followed: true },
      { revalidate: false },
    );
    expect(mockGlobalMutate).toHaveBeenCalledWith(
      "/api/v1/outlet-notifications",
    );
  },
);

test("an existing session without email proof goes to the normal OTP form with explicit reauthentication", async () => {
  state({
    enabled: false,
    is_followed: true,
    requires_email_login: true,
    available: true,
  });
  render();
  await click();
  expect(mockPush).toHaveBeenCalledWith(
    `/login?verifyEmail=1&callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

test("proof that expires between read and enable routes to OTP without showing a generic error", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ context: { code: "EMAIL_LOGIN_REQUIRED" } }),
  });
  render();
  await click();
  expect(mockPush).toHaveBeenCalledWith(
    expect.stringContaining("verifyEmail=1"),
  );
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("visitors preserve the return location and do not mutate", async () => {
  state(undefined, new ApiClientError(401, "Signed out"));
  render();
  await click();
  expect(mockPush).toHaveBeenCalledWith(
    `/login?callbackUrl=${encodeURIComponent(mockRouter.asPath)}`,
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

test("a failed update keeps its previous state, reports an error and enables retry", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  render();
  await click();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not update notifications",
  );
  expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe(
    "false",
  );
  expect(container.querySelector("button")?.disabled).toBe(false);
  expect(mockMutate).not.toHaveBeenCalled();
});

test("rollout-disabled notifications do not offer a bell", () => {
  state({
    enabled: false,
    is_followed: false,
    requires_email_login: false,
    available: false,
  });
  render();
  expect(container.querySelector("button")).toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});

test("an existing subscription can opt out while delivery is paused and cannot opt back in", async () => {
  state({
    enabled: true,
    consent_enabled: true,
    is_followed: true,
    requires_email_login: false,
    available: false,
  });
  const confirmed = {
    enabled: false,
    consent_enabled: false,
    is_followed: true,
    requires_email_login: false,
    available: false,
  };
  mockFetch.mockResolvedValue({ ok: true, json: async () => confirmed });
  render();
  expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
    "Email notifications paused. Click to disable.",
  );
  expect(container.querySelector("button")?.disabled).toBe(false);
  await click();
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/v1/stores/club/notifications",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ enabled: false, locale: "pt-BR" }),
    }),
  );
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockMutate).toHaveBeenCalledWith(confirmed, { revalidate: false });
  state(confirmed);
  render();
  expect(container.querySelector("button")).toBeNull();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
  "stored consent can be withdrawn without OTP while proof is pending and availability=%s",
  async (available) => {
    state({
      enabled: false,
      consent_enabled: true,
      is_followed: true,
      requires_email_login: true,
      available,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        enabled: false,
        consent_enabled: false,
        is_followed: true,
        requires_email_login: true,
        available,
      }),
    });
    render();
    expect(
      container.querySelector("button")?.getAttribute("aria-pressed"),
    ).toBe("true");
    await click();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/stores/club/notifications",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ enabled: false, locale: "pt-BR" }),
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  },
);

test("a failed follow-up refresh does not turn an accepted toggle into a retryable failure", async () => {
  const confirmed = {
    enabled: true,
    is_followed: true,
    requires_email_login: false,
  };
  mockFetch.mockResolvedValue({ ok: true, json: async () => confirmed });
  mockGlobalMutate.mockRejectedValue(new Error("Refresh failed"));
  render();
  await click();
  expect(mockMutate).toHaveBeenCalledWith(confirmed, { revalidate: false });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
