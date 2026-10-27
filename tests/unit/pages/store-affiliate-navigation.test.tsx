/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import useSWR from "swr";
import StoreManagePage from "pages/store/[slug]/manage";
import type { AffiliateEditState } from "components/creator/OutletAffiliateWorkspace";

const replace = jest.fn();
jest.mock("lib/creator-funnel-analytics", () => ({
  CREATOR_OUTLET_FUNNEL_VERSION: 1,
  creatorFunnelAnalytics: {},
}));
jest.mock("next/router", () => ({
  useRouter: () => ({
    query: { slug: "lantern-club", tab: "affiliates" },
    pathname: "/store/[slug]/manage",
    replace,
  }),
}));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
  useSWRConfig: () => ({ mutate: jest.fn() }),
}));
jest.mock("components/store/OutletCustomizationForm", () => ({
  OutletCustomizationForm: () => null,
}));
jest.mock("components/creator/CatalogCurationWorkspace", () => ({
  CatalogCurationWorkspace: () => null,
}));
jest.mock("components/creator/OutletAffiliateWorkspace", () => ({
  OutletAffiliateWorkspace: ({
    onEditStateChange,
  }: {
    onEditStateChange: (state: AffiliateEditState) => void;
  }) => (
    <>
      <button
        onClick={() => onEditStateChange({ dirty: true, pending: false })}
      >
        Make unsaved edit
      </button>
      <button
        onClick={() => onEditStateChange({ dirty: false, pending: true })}
      >
        Begin saving
      </button>
      <button
        onClick={() => onEditStateChange({ dirty: false, pending: false })}
      >
        Cancel edit
      </button>
    </>
  ),
}));

const capabilities = {
  identity: true,
  curation: true,
  featured: true,
  sales: true,
  earnings: true,
  edit: true,
  analytics: true,
  publish: true,
  unpublish: true,
};
const outlet = {
  id: "outlet-1",
  slug: "lantern-club",
  name: "Lantern Club",
  status: "PUBLISHED",
  owner_id: "owner",
  draft_revision: 3,
};
const publication = {
  status: "PUBLISHED",
  draft_revision: 3,
  published_revision: { id: "revision-1", source_draft_revision: 2 },
  readiness: { version: 2, ready: true, checks: {}, blockers: [] },
  capabilities,
};
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  replace.mockClear();
  jest.mocked(useSWR).mockImplementation(((key: unknown) => {
    const url = Array.isArray(key) ? key[0] : key;
    const data =
      typeof url === "string" && url.endsWith("management-shell")
        ? { store: outlet, capabilities }
        : typeof url === "string" && url.endsWith("publication")
          ? publication
          : typeof url === "string" && url.endsWith("tag-filters")
            ? []
            : outlet;
    return { data, isLoading: false, isValidating: false, mutate: jest.fn() };
  }) as typeof useSWR);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent === text,
  )!;
}

test.each(["Make unsaved edit", "Begin saving"])(
  "protects the mounted editor when %s, and Cancel releases navigation",
  async (action) => {
    await act(async () => root.render(<StoreManagePage />));
    await act(async () => button(action).click());
    const analyticsTab = document.querySelector<HTMLButtonElement>(
      "#outlet-manage-tab-analytics",
    )!;
    await act(async () => analyticsTab.click());
    expect(replace).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /Save or cancel|Wait for the current action/,
    );
    const affiliateTab = document.querySelector<HTMLButtonElement>(
      "#outlet-manage-tab-affiliates",
    )!;
    await act(async () =>
      affiliateTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(replace).not.toHaveBeenCalled();
    const viewLink = document.querySelector<HTMLAnchorElement>(
      'a[href="/store/lantern-club"]',
    )!;
    const navigation = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => viewLink.dispatchEvent(navigation));
    expect(navigation.defaultPrevented).toBe(true);
    expect(button("Publish changes").disabled).toBe(true);
    expect(button("Unpublish").disabled).toBe(true);
    await act(async () => button("Cancel edit").click());
    expect(button("Publish changes").disabled).toBe(false);
    await act(async () => analyticsTab.click());
    expect(replace).toHaveBeenCalledTimes(1);
  },
);

test("the actual editor protects a dirty form from native unload and clears the guard on Cancel", async () => {
  const { OutletAffiliateWorkspace } = jest.requireActual<
    typeof import("components/creator/OutletAffiliateWorkspace")
  >("components/creator/OutletAffiliateWorkspace");
  const onEditStateChange = jest.fn();
  jest.mocked(useSWR).mockImplementation(((key: unknown) => ({
    data: String(key).includes("affiliate-links")
      ? { links: [], draft_revision: 3 }
      : { ready: true, publishedRevision: { sourceDraftRevision: 3 } },
    isLoading: false,
    mutate: jest.fn(),
  })) as typeof useSWR);
  await act(async () =>
    root.render(
      <OutletAffiliateWorkspace
        storeSlug="lantern-club"
        canPublish
        onEditStateChange={onEditStateChange}
      />,
    ),
  );
  const input = document.querySelector<HTMLInputElement>('input[type="url"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "https://www.amazon.com.br/?tag=synthetic-20");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onEditStateChange).toHaveBeenLastCalledWith({
    dirty: true,
    pending: false,
  });
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () => button("Cancel").click());
  expect(onEditStateChange).toHaveBeenLastCalledWith({
    dirty: false,
    pending: false,
  });
  const cleanUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
});
