import { renderToStaticMarkup } from "react-dom/server";
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

test("keeps full game titles, ordering, and outlet attribution without a price taking over the card", () => {
  const { games } = selectionFixture();
  games[0].title =
    "A particularly long title that still needs to be readable on a phone";
  const html = renderToStaticMarkup(
    <SelectionGames games={games} outletSlug="example-outlet" />,
  );
  expect(html).toContain(games[0].title);
  expect(html).toContain('href="/item/peak?store=example-outlet"');
  expect(html).toContain("<ol");
  expect(html).not.toContain("truncate");
  expect(html).not.toContain("Price unavailable");
});
test("private preview navigation stays in the draft outlet context", () => {
  const html = renderToStaticMarkup(
    <SelectionGames
      games={selectionFixture().games}
      outletSlug="example-outlet"
      preview
    />,
  );
  expect(html).toContain(
    'href="/item/peak?store=example-outlet&amp;preview=1"',
  );
});
