import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  CreatorOutletOverview,
  type CreatorOutletOverviewProps,
  type CreatorOutletPublication,
} from "components/creator/CreatorOutletOverview";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: jest.fn(),
    useRef: jest.fn(),
    useState: jest.fn(),
  };
});

jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (message: string) => message,
  }),
}));

const mockUseEffect = jest.mocked(useEffect);
const mockUseRef = jest.mocked(useRef);
const mockUseState = jest.mocked(useState);

type TestElement = ReactElement<Record<string, unknown>>;
type Effect = () => void | (() => void);

let hookValues: unknown[];
let hookIndex: number;
let effects: Effect[];

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
  mockUseRef.mockImplementation(((initial: unknown) => {
    const index = hookIndex++;
    if (!(index in hookValues)) hookValues[index] = { current: initial };
    return hookValues[index];
  }) as typeof useRef);
  mockUseEffect.mockImplementation(((effect: Effect) => {
    effects.push(effect);
  }) as typeof useEffect);
}

function renderOverview(props: CreatorOutletOverviewProps): ReactNode {
  hookIndex = 0;
  effects = [];
  return CreatorOutletOverview(props);
}

function allElements(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  const children = Children.toArray(element.props.children as ReactNode);
  return [element, ...children.flatMap(allElements)];
}

function findElement(
  node: ReactNode,
  predicate: (element: TestElement) => boolean,
): TestElement {
  const found = allElements(node).find(predicate);
  if (!found) throw new Error("Expected element was not rendered");
  return found;
}

function invokeFunctionElement(element: TestElement): ReactNode {
  if (typeof element.type !== "function") {
    throw new Error("Expected a function component");
  }
  return element.type(element.props);
}

function elementText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isValidElement(node)) return "";
  return Children.toArray((node as TestElement).props.children as ReactNode)
    .map(elementText)
    .join("");
}

function readyPublication(): CreatorOutletPublication {
  return {
    status: "DRAFT",
    publishedAt: null,
    lastPublishedAt: null,
    draftRevision: 7,
    catalogMode: "SELECTED",
    publishedRevision: null,
    readinessVersion: 2,
    catalogGameCount: 5,
    ready: true,
    checks: {
      brand_complete: true,
      catalog_intentional: true,
      catalog_has_games: true,
      editorial_highlight: true,
    },
    capabilities: { edit: true, publish: true, unpublish: true },
  };
}

function props(
  overrides: Partial<CreatorOutletOverviewProps> = {},
): CreatorOutletOverviewProps {
  return {
    store: {
      slug: "save-point",
      name: "Save Point",
      description: "A deliberate selection.",
      logo_url: "https://cdn.example.test/logo.png",
      status: "DRAFT",
    },
    publication: readyPublication(),
    ...overrides,
  };
}

function fakeWindow() {
  const listeners = new Map<string, (event: MessageEvent) => void>();
  let timeout: (() => void) | null = null;
  const value = {
    location: { origin: "https://manifold.example" },
    setTimeout: jest.fn((callback: () => void) => {
      timeout = callback;
      return 1;
    }),
    clearTimeout: jest.fn(),
    addEventListener: jest.fn(
      (type: string, listener: (event: MessageEvent) => void) => {
        listeners.set(type, listener);
      },
    ),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  });
  return {
    dispatchMessage: (event: MessageEvent) => listeners.get("message")?.(event),
    runTimeout: () => timeout?.(),
  };
}

describe("CreatorOutletOverview interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHooks();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("opens Preview, waits for its authenticated handshake, then confirms review", () => {
    const browser = fakeWindow();
    const onPreview = jest.fn();
    const input = props({ onPreview });
    let tree = renderOverview(input);
    const action = findElement(
      tree,
      (element) =>
        typeof element.type === "function" &&
        element.type.name === "PrimaryActionControl",
    );
    const previewButton = invokeFunctionElement(action) as TestElement;

    expect(previewButton.props["data-creator-primary-action"]).toBe("preview");
    (previewButton.props.onClick as () => void)();

    tree = renderOverview(input);
    const iframe = findElement(tree, (element) => element.type === "iframe");
    const confirmationBefore = findElement(
      tree,
      (element) =>
        element.type === "button" &&
        elementText(element).includes("Loading preview..."),
    );
    expect(confirmationBefore.props.disabled).toBe(true);

    const source = {};
    (iframe.props.ref as { current: unknown }).current = {
      contentWindow: source,
    };
    effects[0]?.();
    browser.dispatchMessage({
      origin: "https://manifold.example",
      source,
      data: {
        type: "manifold:outlet-preview-ready",
        slug: "save-point",
      },
    } as unknown as MessageEvent);

    tree = renderOverview(input);
    const confirmationAfter = findElement(
      tree,
      (element) =>
        element.type === "button" &&
        elementText(element).includes("I reviewed the preview"),
    );
    expect(confirmationAfter.props.disabled).toBe(false);
    (confirmationAfter.props.onClick as () => void)();
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  test("keeps confirmation disabled on timeout and retries with a fresh iframe", () => {
    const browser = fakeWindow();
    const input = props({ onPreview: jest.fn() });
    let tree = renderOverview(input);
    const action = findElement(
      tree,
      (element) =>
        typeof element.type === "function" &&
        element.type.name === "PrimaryActionControl",
    );
    (
      (invokeFunctionElement(action) as TestElement).props.onClick as () => void
    )();

    tree = renderOverview(input);
    const firstIframe = findElement(
      tree,
      (element) => element.type === "iframe",
    );
    effects[0]?.();
    browser.runTimeout();

    tree = renderOverview(input);
    const alert = findElement(
      tree,
      (element) => element.props.role === "alert",
    );
    const retry = findElement(
      alert,
      (element) =>
        element.type === "button" && elementText(element).includes("Try again"),
    );
    (retry.props.onClick as () => void)();

    tree = renderOverview(input);
    const secondIframe = findElement(
      tree,
      (element) => element.type === "iframe",
    );
    expect(secondIframe.key).not.toBe(firstIframe.key);
    expect(
      allElements(tree).some((element) => element.props.role === "alert"),
    ).toBe(false);
  });

  test("invokes the supplied retry from the overview error state", () => {
    fakeWindow();
    const retry = jest.fn();
    const tree = renderOverview(
      props({ publication: null, error: "Publication failed", retry }),
    );
    const errorView = findElement(
      tree,
      (element) =>
        typeof element.type === "function" &&
        element.type.name === "OverviewError",
    );
    const renderedError = invokeFunctionElement(errorView);
    const retryButton = findElement(
      renderedError,
      (element) =>
        element.type === "button" && elementText(element).includes("Try again"),
    );

    (retryButton.props.onClick as () => void)();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
