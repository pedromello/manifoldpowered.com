/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SelectionGames } from "components/store/SelectionGames";
import { selectionFixture } from "tests/unit/_fixtures/selection";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

test("sale filtering retains author order and excludes stale captures", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const game = selectionFixture().games[0];
  const games = ["first", "stale", "last"].map((slug) => ({
    ...game,
    id: slug,
    slug,
    title: slug,
    purchase_mode: "NINTENDO_ONLY" as const,
    external_offer: {
      provider: "NINTENDO" as const,
      amount: "10.00",
      original_amount: "20.00",
      discount_percent: 50,
      currency: "BRL",
    },
    catalog_offer: {
      state: slug === "stale" ? ("stale" as const) : ("current" as const),
      discount_percent: slug === "stale" ? null : 50,
      captured_at: null,
    },
  }));
  try {
    await act(async () =>
      root.render(<SelectionGames games={games} outletSlug="curator" />),
    );
    expect(container.querySelectorAll("li")).toHaveLength(3);
    await act(async () =>
      (container.querySelectorAll("button")[1] as HTMLButtonElement).click(),
    );
    expect(
      [...container.querySelectorAll("h3")].map((node) => node.textContent),
    ).toEqual(["first", "last"]);
    expect(
      container.querySelectorAll("button")[1].getAttribute("aria-pressed"),
    ).toBe("true");
    await act(async () =>
      (container.querySelectorAll("button")[0] as HTMLButtonElement).click(),
    );
    expect(container.querySelectorAll("li")).toHaveLength(3);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
