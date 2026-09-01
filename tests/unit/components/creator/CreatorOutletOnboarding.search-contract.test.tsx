import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type EffectCallback,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import useSWR from "swr";

import { CreatorOutletOnboarding } from "components/creator/CreatorOutletOnboarding";
import { GameAutocomplete } from "components/store/GameAutocomplete";
import {
  fetchOutletPublication,
  previewExplicitOutletSelection,
} from "lib/creator-outlet-client";
import {
  createCreatorOutletDraft,
  type CreatorOutletDraft,
  type CreatorSelectionStrategy,
} from "lib/creator-lifecycle";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: jest.fn(),
    useRef: jest.fn(),
    useState: jest.fn(),
  };
});
jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("components/store/GameAutocomplete", () => ({
  GameAutocomplete: jest.fn(() => null),
}));
jest.mock("lib/creator-outlet-client", () => {
  const actual = jest.requireActual<typeof import("lib/creator-outlet-client")>(
    "lib/creator-outlet-client",
  );
  return {
    ...actual,
    fetchOutletPublication: jest.fn(),
    previewExplicitOutletSelection: jest.fn(),
  };
});
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    t: (message: string) => message,
    translateError: (message: string | null, fallback: string) =>
      message || fallback,
  }),
}));

const mockAutocomplete = jest.mocked(GameAutocomplete);
const mockFetchOutletPublication = jest.mocked(fetchOutletPublication);
const mockPreviewExplicitOutletSelection = jest.mocked(
  previewExplicitOutletSelection,
);
const mockUseEffect = jest.mocked(useEffect);
const mockUseRef = jest.mocked(useRef);
const mockUseRouter = jest.mocked(useRouter);
const mockUseState = jest.mocked(useState);
const mockUseSWR = jest.mocked(useSWR);

type TestElement = ReactElement<Record<string, unknown>>;

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

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isValidElement(node)) {
    return Children.toArray(node).map(textContent).join(" ");
  }
  return textContent((node as TestElement).props.children as ReactNode);
}

function findFunctionElement(node: ReactNode, name: string): TestElement {
  const found = allElements(node).find(
    (element) =>
      typeof element.type === "function" && element.type.name === name,
  );
  if (!found) throw new Error(`${name} was not rendered`);
  return found;
}

function arrangeOnboarding(
  draft: CreatorOutletDraft,
  existingCatalogMode: "ALL" | "SELECTED" | null = null,
) {
  mockUseState
    .mockReturnValueOnce([draft, jest.fn()])
    .mockReturnValueOnce([true, jest.fn()])
    .mockReturnValueOnce(["idle", jest.fn()])
    .mockReturnValueOnce([null, jest.fn()])
    .mockReturnValueOnce([false, jest.fn()])
    .mockReturnValueOnce([[], jest.fn()])
    .mockReturnValueOnce([null, jest.fn()])
    .mockReturnValueOnce([false, jest.fn()])
    .mockReturnValueOnce([null, jest.fn()])
    .mockReturnValueOnce([existingCatalogMode, jest.fn()]);
}

function selectionDraft(strategy: CreatorSelectionStrategy) {
  const draft = createCreatorOutletDraft(
    "owner-1",
    "2026-09-01T12:00:00.000Z",
    `draft-${strategy.toLowerCase()}`,
  );
  draft.currentStep = "SELECTION";
  draft.storeSlug = "saved-outlet";
  draft.selection =
    strategy === "FOCUSED"
      ? { strategy, tags: ["rpg"], games: [] }
      : {
          strategy,
          tags: [],
          games: Array.from({ length: 5 }, (_, index) => ({
            id: `game-${index + 1}`,
            slug: `game-${index + 1}`,
            title: `Game ${index + 1}`,
            bannerUrl: null,
          })),
        };
  return draft;
}

describe("creator onboarding game search contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const draft = createCreatorOutletDraft(
      "owner-1",
      "2026-09-01T12:00:00.000Z",
      "draft-1",
    );
    draft.currentStep = "SELECTION";
    draft.selection = { strategy: "HANDPICKED", tags: [], games: [] };

    mockUseRouter.mockReturnValue({
      query: {},
      isReady: true,
      asPath: "/store/new",
      replace: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    mockUseSWR.mockReturnValue({
      data: { id: "owner-1", username: "creator" },
      error: undefined,
      isLoading: false,
    } as ReturnType<typeof useSWR>);
    mockUseRef.mockImplementation((initial) => ({ current: initial }));
    mockUseEffect.mockImplementation(() => undefined);
    arrangeOnboarding(draft);
  });

  test("leaves HANDPICKED search on the GET /api/v1/games default", () => {
    const onboarding = CreatorOutletOnboarding();
    const selection = findFunctionElement(onboarding, "SelectionStep");
    if (typeof selection.type !== "function") {
      throw new Error("SelectionStep must be a function component");
    }
    const renderedSelection = selection.type(selection.props);
    const autocomplete = allElements(renderedSelection).find(
      (element) => element.type === mockAutocomplete,
    );

    expect(autocomplete).toBeDefined();
    expect(autocomplete?.props.endpoint).toBeUndefined();
    expect(JSON.stringify(autocomplete?.props)).not.toContain(
      "/api/v1/items/games",
    );
  });

  test.each([
    {
      scenario: "a lost HANDPICKED save response",
      strategy: "HANDPICKED" as const,
      catalogMode: "SELECTED" as const,
    },
    {
      scenario: "a restored FOCUSED draft",
      strategy: "FOCUSED" as const,
      catalogMode: "ALL" as const,
    },
  ])(
    "offers a live curation CTA instead of a dead save button after $scenario",
    ({ strategy, catalogMode }) => {
      mockUseState.mockReset();
      arrangeOnboarding(selectionDraft(strategy), catalogMode);

      const onboarding = CreatorOutletOnboarding();
      const selection = findFunctionElement(onboarding, "SelectionStep");
      if (typeof selection.type !== "function") {
        throw new Error("SelectionStep must be a function component");
      }
      const renderedSelection = selection.type(selection.props);
      const selectionElements = allElements(renderedSelection);
      const curationLinks = selectionElements.filter(
        (element) =>
          element.props.href === "/store/saved-outlet/manage?tab=curation",
      );
      const saveButtons = selectionElements.filter(
        (element) =>
          typeof element.type === "function" &&
          element.type.name === "PrimaryButton",
      );

      expect(curationLinks).toHaveLength(2);
      expect(saveButtons).toHaveLength(0);
      expect(textContent(renderedSelection)).toContain(
        "This Outlet already has a saved game selection.",
      );
    },
  );

  test.each([
    ["HANDPICKED" as const, "SELECTED" as const],
    ["FOCUSED" as const, "ALL" as const],
  ])(
    "skips the %s preview POST when the server already reports %s",
    async (strategy, catalogMode) => {
      const testGlobal = globalThis as unknown as Record<string, unknown>;
      const originalWindow = testGlobal.window;
      let scheduledCallback: (() => Promise<void>) | null = null;
      Object.defineProperty(testGlobal, "window", {
        configurable: true,
        value: {
          setTimeout: (callback: () => Promise<void>) => {
            scheduledCallback = callback;
            return 1;
          },
          clearTimeout: jest.fn(),
        },
      });
      try {
        mockUseState.mockReset();
        arrangeOnboarding(selectionDraft(strategy));
        const effects: EffectCallback[] = [];
        mockUseEffect.mockImplementation((effect) => {
          effects.push(effect);
        });
        mockFetchOutletPublication.mockResolvedValue({
          catalogMode,
        } as Awaited<ReturnType<typeof fetchOutletPublication>>);

        const onboarding = CreatorOutletOnboarding();
        const selection = findFunctionElement(onboarding, "SelectionStep");
        if (typeof selection.type !== "function") {
          throw new Error("SelectionStep must be a function component");
        }
        selection.type(selection.props);
        const previewEffect = effects.at(-1);
        if (!previewEffect) throw new Error("Selection preview effect missing");
        const cleanup = previewEffect();

        if (!scheduledCallback) throw new Error("Preview timer missing");
        await scheduledCallback();

        expect(mockFetchOutletPublication).toHaveBeenCalledWith("saved-outlet");
        expect(mockPreviewExplicitOutletSelection).not.toHaveBeenCalled();
        if (typeof cleanup === "function") cleanup();
      } finally {
        if (originalWindow === undefined) {
          Reflect.deleteProperty(testGlobal, "window");
        } else {
          Object.defineProperty(testGlobal, "window", {
            configurable: true,
            value: originalWindow,
          });
        }
      }
    },
  );
});
