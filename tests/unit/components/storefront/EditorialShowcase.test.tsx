import { renderToStaticMarkup } from "react-dom/server";
import { EditorialShowcase } from "components/storefront/default/EditorialShowcase";
import { selectionFixture } from "tests/unit/_fixtures/selection";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock("components/store/GameWishlistButton", () => ({
  GameWishlistButton: ({ slug }) => <button data-game={slug}>Save game</button>,
}));

test("game and selection actions lead to different destinations with the actual outlet attribution", () => {
  const data = selectionFixture();
  const html = renderToStaticMarkup(<EditorialShowcase selections={[data]} />);
  expect(html).toContain('href="/item/peak?store=example-outlet"');
  expect(html).toContain(
    'href="/store/example-outlet/selections/weekend-coop"',
  );
  expect(html).toContain("Explore selection");
  expect(html).toContain(data.games[0].recommendation_reason);
  expect(html).toContain("Example Outlet");
  expect(html).toContain("Weekend co-op");
});
test("the two secondary picks keep their own outlet and selection context", () => {
  const first = selectionFixture();
  const second = selectionFixture();
  second.selection.id = "second";
  second.outlet.slug = "mystery-outlet";
  second.selection.public_path = "/store/mystery-outlet/selections/mysteries";
  const third = selectionFixture();
  third.selection.id = "third";
  third.outlet.slug = "simulation-outlet";
  third.selection.public_path = "/store/simulation-outlet/selections/building";
  const html = renderToStaticMarkup(
    <EditorialShowcase selections={[first, second, third]} />,
  );
  expect(html).toContain('href="/item/peak?store=mystery-outlet"');
  expect(html).toContain('href="/store/mystery-outlet/selections/mysteries"');
  expect(html).toContain('href="/item/peak?store=simulation-outlet"');
  expect(html).toContain('href="/store/simulation-outlet/selections/building"');
});
test("unavailable entries do not create empty recommendation cards or broken links", () => {
  const unavailable = selectionFixture();
  unavailable.games = [];
  expect(
    renderToStaticMarkup(<EditorialShowcase selections={[unavailable]} />),
  ).toBe("");
});
