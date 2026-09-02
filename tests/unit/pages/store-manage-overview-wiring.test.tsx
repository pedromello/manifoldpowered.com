import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import useSWR, { useSWRConfig } from "swr";

import { CreatorOutletOverview } from "components/creator/CreatorOutletOverview";
import {
  fetchOutletPublication,
  updateOutletPublication,
} from "lib/creator-outlet-client";
import { creatorFunnelAnalytics } from "lib/creator-funnel-analytics";
import type { OutletPublicationContract } from "lib/creator-lifecycle";
import StoreManagePage from "pages/store/[slug]/manage";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: jest.fn(),
    useState: jest.fn(),
  };
});

jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("next/head", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
  useSWRConfig: jest.fn(),
}));
jest.mock("components/creator/CreatorOutletOverview", () => ({
  CreatorOutletOverview: jest.fn(() => null),
}));
jest.mock("components/creator/CatalogCurationWorkspace", () => ({
  CatalogCurationWorkspace: () => null,
}));
jest.mock("components/store/GameAutocomplete", () => ({
  GameAutocomplete: () => null,
}));
jest.mock("lib/creator-outlet-client", () => ({
  CreatorOutletRequestError: class CreatorOutletRequestError extends Error {
    status = null;
  },
  fetchOutletPublication: jest.fn(),
  updateOutletPublication: jest.fn(),
}));
jest.mock("lib/creator-funnel-analytics", () => ({
  CREATOR_OUTLET_FUNNEL_VERSION: 1,
  creatorFunnelAnalytics: {
    previewed: jest.fn(),
    published: jest.fn(),
    linkCopied: jest.fn(),
    firstGameAdded: jest.fn(),
  },
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    t: (message: string) => message,
    translateError: (message: string | null, fallback: string) =>
      message || fallback,
  }),
}));

const mockUseEffect = jest.mocked(useEffect);
const mockUseRouter = jest.mocked(useRouter);
const mockUseState = jest.mocked(useState);
const mockUseSWR = jest.mocked(useSWR);
const mockUseSWRConfig = jest.mocked(useSWRConfig);
const mockOverview = jest.mocked(CreatorOutletOverview);
const mockFetchPublication = jest.mocked(fetchOutletPublication);
const mockUpdatePublication = jest.mocked(updateOutletPublication);
const mockAnalytics = jest.mocked(creatorFunnelAnalytics);

type TestElement = ReactElement<Record<string, unknown>>;

let hookValues: unknown[];
let hookIndex: number;
let effects: Array<() => void | (() => void)>;

function resetHooks() {
  hookValues = [];
  hookIndex = 0;
  effects = [];
  mockUseState.mockImplementation(((initial: unknown) => {
    const index = hookIndex++;
    if (!(index in hookValues)) {
      hookValues[index] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    return [
      hookValues[index],
      (next: unknown) => {
        hookValues[index] =
          typeof next === "function"
            ? (next as (current: unknown) => unknown)(hookValues[index])
            : next;
      },
    ];
  }) as typeof useState);
  mockUseEffect.mockImplementation(((effect: () => void | (() => void)) => {
    effects.push(effect);
  }) as typeof useEffect);
}

function allElements(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [
    element,
    ...Children.toArray(element.props.children as ReactNode).flatMap(
      allElements,
    ),
  ];
}

function findFunctionElement(node: ReactNode, name: string): TestElement {
  const found = allElements(node).find(
    (element) =>
      typeof element.type === "function" && element.type.name === name,
  );
  if (!found) throw new Error(`${name} was not rendered`);
  return found;
}

function invoke(element: TestElement): ReactNode {
  if (typeof element.type !== "function") {
    throw new Error("Expected a function component");
  }
  return element.type(element.props);
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isValidElement(node)) return "";
  return Children.toArray((node as TestElement).props.children as ReactNode)
    .map(textContent)
    .join("");
}

const store = {
  id: "store-1",
  slug: "save-point",
  name: "Save Point",
  description: "A deliberate selection.",
  logo_url: "https://cdn.example.test/logo.png",
  owner_id: "owner-1",
  status: "DRAFT" as const,
  published_at: null,
  catalog_mode: "SELECTED" as const,
};

function publication(
  status: "DRAFT" | "PUBLISHED" = "DRAFT",
): OutletPublicationContract {
  return {
    status,
    publishedAt: status === "PUBLISHED" ? "2026-09-01T12:00:00.000Z" : null,
    lastPublishedAt: status === "PUBLISHED" ? "2026-09-01T12:00:00.000Z" : null,
    draftRevision: 7,
    catalogMode: "SELECTED",
    publishedRevision:
      status === "PUBLISHED"
        ? { id: "revision-1", revision: 1, sourceDraftRevision: 7 }
        : null,
    readinessVersion: 2,
    catalogGameCount: 5,
    ready: true,
    checks: {
      brand_complete: true,
      catalog_intentional: true,
      catalog_has_games: true,
      editorial_highlight: true,
    },
    capabilities: {
      identity: true,
      curation: true,
      featured: true,
      sales: true,
      earnings: true,
      edit: true,
      publish: true,
      unpublish: true,
    },
  };
}

function arrangePanel(currentPublication = publication()) {
  const mutatePublication = jest.fn().mockResolvedValue(undefined);
  const mutateGlobal = jest.fn().mockResolvedValue(undefined);
  mockUseRouter.mockReturnValue({
    query: { slug: "save-point", tab: "overview" },
    pathname: "/store/[slug]/manage",
    replace: jest.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  mockUseSWR.mockImplementation(((key: string) => {
    if (key === "/api/v1/stores/save-point/management-shell") {
      return {
        data: {
          store: {
            id: store.id,
            slug: store.slug,
            name: store.name,
            owner_id: store.owner_id,
            status: store.status,
            published_at: store.published_at,
          },
          capabilities: currentPublication.capabilities,
        },
        isLoading: false,
        error: undefined,
        mutate: jest.fn(),
      };
    }
    if (key === "/api/v1/stores/save-point?preview=1") {
      return { data: store, isLoading: false, error: undefined };
    }
    if (key === "/api/v1/stores/save-point/tag-filters") {
      return { data: [], isLoading: false, error: undefined };
    }
    if (key === "/api/v1/stores/save-point/publication") {
      return {
        data: currentPublication,
        isLoading: false,
        error: undefined,
        mutate: mutatePublication,
      };
    }
    throw new Error(`Unexpected SWR key: ${String(key)}`);
  }) as typeof useSWR);
  mockUseSWRConfig.mockReturnValue({
    mutate: mutateGlobal,
    cache: new Map(),
    refreshInterval: 0,
    dedupingInterval: 0,
    loadingTimeout: 0,
    focusThrottleInterval: 0,
    errorRetryInterval: 0,
    errorRetryCount: 0,
    fallback: {},
    isPaused: () => false,
    isOnline: () => true,
    isVisible: () => true,
    initFocus: () => () => undefined,
    initReconnect: () => () => undefined,
  } as unknown as ReturnType<typeof useSWRConfig>);

  hookIndex = 0;
  effects = [];
  const page = StoreManagePage();
  const panel = findFunctionElement(page, "CreatorOverviewPanel");
  resetHooks();
  const overviewElement = invoke(panel) as TestElement;
  expect(overviewElement.type).toBe(mockOverview);
  return {
    props: overviewElement.props,
    mutatePublication,
    mutateGlobal,
  };
}

describe("store manage Overview wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHooks();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  test("wires the real Overview tab to V2 publication data and retry", async () => {
    const currentPublication = publication();
    mockFetchPublication.mockResolvedValue(currentPublication);
    const { props, mutatePublication } = arrangePanel(currentPublication);

    const publicationCall = mockUseSWR.mock.calls.find(
      ([key]) => key === "/api/v1/stores/save-point/publication",
    );
    expect(publicationCall).toBeDefined();
    await expect(
      (publicationCall?.[1] as () => Promise<OutletPublicationContract>)(),
    ).resolves.toBe(currentPublication);
    expect(mockFetchPublication).toHaveBeenCalledWith("save-point");
    expect(props).toMatchObject({
      store,
      publication: currentPublication,
      loading: false,
      error: null,
      previewedAt: null,
      canEdit: true,
      canPublish: true,
      canUnpublish: true,
    });
    expect(props.onPreview).toEqual(expect.any(Function));
    expect(props.onPublish).toEqual(expect.any(Function));
    expect(props.retry).toEqual(expect.any(Function));

    (props.retry as () => void)();
    expect(mutatePublication).toHaveBeenCalledTimes(1);
  });

  test("opens a statement-only delegate on Earnings without requesting any draft resource", () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({
      query: { slug: "save-point", tab: "overview" },
      pathname: "/store/[slug]/manage",
      asPath: "/store/save-point/manage?tab=overview",
      isReady: true,
      replace,
    } as unknown as ReturnType<typeof useRouter>);
    const financeCapabilities: OutletPublicationContract["capabilities"] = {
      identity: false,
      curation: false,
      featured: false,
      sales: false,
      earnings: true,
      edit: false,
      publish: false,
      unpublish: false,
    };
    mockUseSWR.mockImplementation(((key: string | null) => {
      if (key === "/api/v1/stores/save-point/management-shell") {
        return {
          data: {
            store: {
              id: store.id,
              slug: store.slug,
              name: store.name,
              owner_id: store.owner_id,
              status: store.status,
              published_at: store.published_at,
            },
            capabilities: financeCapabilities,
          },
          isLoading: false,
          error: undefined,
          mutate: jest.fn(),
        };
      }
      if (key === null) {
        return {
          data: undefined,
          isLoading: false,
          error: undefined,
          mutate: jest.fn(),
        };
      }
      throw new Error(
        `Financial shell requested forbidden key: ${String(key)}`,
      );
    }) as typeof useSWR);

    const page = StoreManagePage();
    const renderedFunctionNames = allElements(page)
      .filter((element) => typeof element.type === "function")
      .map((element) => (element.type as { name: string }).name);

    expect(renderedFunctionNames).toContain("EarningsTab");
    expect(renderedFunctionNames).not.toContain("CreatorOverviewPanel");
    expect(renderedFunctionNames).not.toContain("LifecyclePanel");
    expect(
      mockUseSWR.mock.calls.map(([key]) => key).filter((key) => key !== null),
    ).toEqual(["/api/v1/stores/save-point/management-shell"]);

    for (const effect of effects) effect();
    expect(replace).toHaveBeenCalledWith(
      {
        pathname: "/store/[slug]/manage",
        query: { slug: "save-point", tab: "earnings" },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  });

  test("shows an accessible Lifecycle error when the publication request cannot reach Manifold", async () => {
    const currentPublication = publication();
    mockUseRouter.mockReturnValue({
      query: { slug: "save-point", tab: "sales" },
      pathname: "/store/[slug]/manage",
      asPath: "/store/save-point/manage?tab=sales",
      isReady: true,
      replace: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    const mutatePublication = jest.fn().mockResolvedValue(undefined);
    mockUseSWR.mockImplementation(((key: unknown) => {
      if (key === "/api/v1/stores/save-point/management-shell") {
        return {
          data: {
            store: {
              id: store.id,
              slug: store.slug,
              name: store.name,
              owner_id: store.owner_id,
              status: store.status,
              published_at: store.published_at,
            },
            capabilities: currentPublication.capabilities,
          },
          isLoading: false,
          error: undefined,
          mutate: jest.fn(),
        };
      }
      if (key === "/api/v1/stores/save-point?preview=1") {
        return { data: store, isLoading: false, error: undefined };
      }
      if (key === "/api/v1/stores/save-point/publication") {
        return {
          data: currentPublication,
          isLoading: false,
          error: undefined,
          mutate: mutatePublication,
        };
      }
      if (key === "/api/v1/stores/save-point/tag-filters") {
        return { data: [], isLoading: false, error: undefined };
      }
      if (
        Array.isArray(key) &&
        key[0] === "/api/v1/stores/save-point/publication" &&
        key[1] === "publication-raw"
      ) {
        return {
          data: {
            status: "DRAFT",
            published_at: null,
            last_published_at: null,
            draft_revision: 7,
            catalog_mode: "SELECTED",
            published_revision: null,
            readiness: {
              version: 2,
              ready: true,
              catalog_game_count: 5,
              checks: {
                brand_complete: true,
                catalog_intentional: true,
                catalog_has_games: true,
                editorial_highlight: true,
              },
              blockers: [],
            },
            capabilities: currentPublication.capabilities,
          },
          isLoading: false,
          isValidating: false,
          error: undefined,
          mutate: jest.fn(),
        };
      }
      throw new Error(`Unexpected SWR key: ${String(key)}`);
    }) as typeof useSWR);
    mockUseSWRConfig.mockReturnValue({
      mutate: jest.fn().mockResolvedValue(undefined),
      cache: new Map(),
    } as unknown as ReturnType<typeof useSWRConfig>);

    const page = StoreManagePage();
    const lifecycle = findFunctionElement(page, "LifecyclePanel");
    resetHooks();
    const renderedLifecycle = invoke(lifecycle);
    const publishButton = allElements(renderedLifecycle).find(
      (element) =>
        element.type === "button" &&
        textContent(element).includes("Publish Outlet"),
    );
    expect(publishButton).toBeDefined();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("network unavailable"));
    try {
      await (publishButton?.props.onClick as () => Promise<void>)();
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(hookValues[2]).toBe(
      "We couldn't reach Manifold. Check your connection and try the publication action again.",
    );
    expect(hookValues[0]).toBeNull();
    expect(mockAnalytics.published).not.toHaveBeenCalled();
  });

  test("tracks Preview and publication only after confirmed success", async () => {
    const published = publication("PUBLISHED");
    mockUpdatePublication.mockResolvedValue(published);
    const { props, mutatePublication, mutateGlobal } = arrangePanel();

    (props.onPreview as () => void)();
    expect(mockAnalytics.previewed).toHaveBeenCalledWith({
      funnelVersion: 1,
      entrySurface: "manage_outlet",
      outletState: "draft",
    });

    await (props.onPublish as () => Promise<void>)();
    expect(mockUpdatePublication).toHaveBeenCalledWith(
      "save-point",
      "publish",
      7,
    );
    expect(mutatePublication).toHaveBeenCalledWith(published, {
      revalidate: false,
    });
    expect(mutateGlobal).toHaveBeenCalledWith(
      "/api/v1/stores/save-point?preview=1",
    );
    expect(mockAnalytics.published).toHaveBeenCalledTimes(1);
    expect(mockAnalytics.published).toHaveBeenCalledWith({
      funnelVersion: 1,
      entrySurface: "manage_outlet",
    });
  });

  test("does not track publication when the transition fails", async () => {
    mockUpdatePublication.mockRejectedValue(new Error("stale draft"));
    const { props, mutatePublication } = arrangePanel();

    await (props.onPublish as () => Promise<void>)();

    expect(mockAnalytics.published).not.toHaveBeenCalled();
    expect(mutatePublication).toHaveBeenCalledWith();
  });
});
