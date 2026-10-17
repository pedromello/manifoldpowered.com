/** @jest-environment jsdom */
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectionWorkspace } from "components/creator/SelectionWorkspace";
import { selectionFixture } from "tests/unit/_fixtures/selection";

const mockRequest = jest.fn();
const mockMutate = jest.fn().mockResolvedValue(undefined);
const first = { ...selectionFixture().selection, draft_revision: 7 };
jest.mock("swr", () => ({
  __esModule: true,
  default: () => ({
    data: {
      selections: [
        first,
        { ...first, id: "other", slug: "other", title: "Another selection" },
      ],
      pagination: { page: 1, pages: 1, total: 2, limit: 20 },
    },
    mutate: mockMutate,
  }),
}));
jest.mock("lib/selection-client", () => ({
  selectionRequest: (...args: unknown[]) => mockRequest(...args),
}));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (text: string, values?: Record<string, string>) =>
      values ? text.replace("{game}", values.game) : text,
  }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
jest.mock("components/store/GameAutocomplete", () => ({
  GameAutocomplete: ({ onSelect }) => (
    <button
      type="button"
      onClick={() => onSelect({ slug: "second", title: "Second Game" })}
    >
      Choose second game
    </button>
  ),
}));

let root: Root;
let container: HTMLDivElement;
function button(label: string) {
  const target = Array.from(container.querySelectorAll("button")).find(
    (b) =>
      b.textContent?.trim() === label ||
      b.getAttribute("aria-label") === label ||
      b.querySelector("span")?.textContent === label,
  );
  if (!target) throw new Error(`Button missing: ${label}`);
  return target;
}
async function load() {
  mockRequest.mockResolvedValueOnce({
    selection: first,
    readiness: { ready: true, blockers: [] },
    games: [{ slug: "peak", title: "PEAK" }],
  });
  await act(async () => button(first.title).click());
}
function editTitle(title: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[maxlength="120"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, title);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockReset();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <SelectionWorkspace storeSlug="example-outlet" canEdit canPublish />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("preserves edits and blocks publication/navigation until saved or explicitly discarded", async () => {
  await load();
  editTitle("Private changed title");
  expect(button("Publish selection").disabled).toBe(true);
  expect(button("Another selection").disabled).toBe(true);
  expect(button("New selection").disabled).toBe(true);
  act(() => button("Discard unsaved changes").click());
  expect(container.querySelector("input")?.value).toBe(first.title);
  expect(button("Publish selection").disabled).toBe(false);
});

test("a conflict retains the local edit and requires an explicit fresh read", async () => {
  await load();
  editTitle("Keep my unsaved title");
  mockRequest.mockRejectedValueOnce(
    new Error("The selection draft changed before the action completed."),
  );
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(container.querySelector("input")?.value).toBe("Keep my unsaved title");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "draft changed",
  );
  expect(mockRequest).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(mockRequest.mock.calls[1][1].body).expected_draft_revision,
  ).toBe(7);
  expect(button("Reload latest selection")).toBeDefined();
});

test("shows game names, supports ordering, and publishes only the saved revision", async () => {
  await load();
  act(() => button("Choose second game").click());
  act(() => button("Move Second Game up").click());
  mockRequest.mockResolvedValueOnce({
    selection: { ...first, game_slugs: ["second", "peak"], draft_revision: 8 },
  });
  mockRequest.mockResolvedValueOnce({
    selection: { ...first, draft_revision: 8 },
    readiness: { ready: true, blockers: [] },
  });
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(JSON.parse(mockRequest.mock.calls[1][1].body).game_slugs).toEqual([
    "second",
    "peak",
  ]);
  mockRequest.mockResolvedValueOnce({
    selection: {
      ...first,
      game_slugs: ["second", "peak"],
      draft_revision: 9,
      published_revision: 2,
    },
  });
  await act(async () => button("Publish selection").click());
  expect(JSON.parse(mockRequest.mock.calls[3][1].body)).toEqual({
    action: "publish",
    expected_draft_revision: 8,
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Selection published.",
  );
});
