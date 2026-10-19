import { renderToStaticMarkup } from "react-dom/server";
import { EditorialShowcase } from "components/storefront/default/EditorialShowcase";
import { I18nProvider } from "lib/i18n";
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
jest.mock("next/router", () => ({
  useRouter: () => ({ locale: "pt-BR" }),
}));

test("game and selection actions lead to different destinations with the actual outlet attribution", () => {
  const data = selectionFixture();
  data.games[0].outlet_review = {
    headline: "An adventure worth sharing.",
    body: "Climbing together makes every mistake memorable.",
  };
  const html = renderToStaticMarkup(<EditorialShowcase selections={[data]} />);
  expect(html).toContain('href="/item/peak?store=example-outlet"');
  expect(html).toContain(
    'href="/store/example-outlet/selections/weekend-coop"',
  );
  expect(html).toContain("Explore selection");
  expect(html).toContain(data.games[0].outlet_review.headline);
  expect(html).toContain("<blockquote");
  expect(html).toContain("Example Outlet");
  expect(html).toContain("Weekend co-op");
});

test.each([
  { name: "no review", review: null },
  { name: "blank review text", review: { headline: " \t ", body: "\r\n  " } },
  {
    name: "a rating-only review",
    review: {
      headline: null,
      body: "",
      rating: { scale: "STARS" as const, value: 0 },
    },
  },
])("shows selection context without a quote for $name", ({ review }) => {
  const data = selectionFixture();
  // Also cover older API payloads that copied selection text into this field.
  data.games[0].recommendation_reason = data.selection.description;
  data.games[0].outlet_review = review;

  const html = renderToStaticMarkup(<EditorialShowcase selections={[data]} />);

  expect(html).toContain("In this selection");
  expect(html).toContain("Example Outlet");
  expect(html).toContain("Weekend co-op");
  expect(html).toContain('href="/item/peak?store=example-outlet"');
  expect(html).toContain("Save game");
  expect(html).toContain("Explore selection");
  expect(html).not.toContain("<blockquote");
  expect(html).not.toContain("lucide-quote");
  expect(html).not.toContain("Why discover it");
  expect(html).not.toContain(data.selection.description);
  if (review && "rating" in review) expect(html).toContain("0/5");
});

test("a legacy game recommendation alone does not become a quote", () => {
  const data = selectionFixture();
  const html = renderToStaticMarkup(<EditorialShowcase selections={[data]} />);

  expect(html).not.toContain("<blockquote");
  expect(html).not.toContain(data.games[0].recommendation_reason);
  expect(html).toContain("In this selection");
});

test.each([
  {
    name: "review headline",
    headline: "  A memorable climb  ",
    body: "The full review belongs on the game page.",
    expected: "A memorable climb",
    omitted: "The full review belongs on the game page.",
  },
  {
    name: "first review paragraph with LF",
    headline: null,
    body: "  Every climb feels different.\n\nThe rest of the review.  ",
    expected: "Every climb feels different.",
    omitted: "The rest of the review.",
  },
  {
    name: "first review paragraph with CRLF and a blank headline",
    headline: "  ",
    body: "A great game to share.\r\n \r\nMore review details.",
    expected: "A great game to share.",
    omitted: "More review details.",
  },
])("quotes the $name from the game's review", (example) => {
  const data = selectionFixture();
  data.games[0].outlet_review = {
    headline: example.headline,
    body: example.body,
  };
  const html = renderToStaticMarkup(<EditorialShowcase selections={[data]} />);

  expect(html).toContain("<blockquote");
  expect(html).toContain("Why discover it");
  expect(html).toContain(example.expected);
  expect(html).not.toContain(example.omitted);
  expect(html).not.toContain(data.selection.description);
  expect(html).not.toContain(data.games[0].recommendation_reason);
});

test("the context-only heading is translated to Brazilian Portuguese", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <EditorialShowcase selections={[selectionFixture()]} />
    </I18nProvider>,
  );

  expect(html).toContain("Nesta seleção");
  expect(html).not.toContain("Por que vale conhecer");
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

test("secondary picks use their own review excerpt and omit generic selection copy", () => {
  const first = selectionFixture();
  first.games[0].outlet_review = {
    headline: "The hero's review headline",
    body: "The hero's full review.",
  };
  const second = selectionFixture();
  second.selection.id = "second";
  second.games[0].slug = "second-game";
  second.games[0].outlet_review = {
    headline: null,
    body: "The second game's review excerpt.\n\nThe second game's full review.",
  };
  const third = selectionFixture();
  third.selection.id = "third";
  third.games[0].slug = "third-game";
  third.games[0].recommendation_reason = third.selection.description;

  const html = renderToStaticMarkup(
    <EditorialShowcase selections={[first, second, third]} />,
  );

  expect(html).toContain("The second game&#x27;s review excerpt.");
  expect(html).not.toContain("The second game&#x27;s full review.");
  expect(html).not.toContain(third.selection.description);
  expect(html).not.toContain(second.games[0].recommendation_reason);
  expect(html.match(/<blockquote/g)).toHaveLength(1);
  expect(html).toContain('href="/item/third-game?store=example-outlet"');
});
test("unavailable entries do not create empty recommendation cards or broken links", () => {
  const unavailable = selectionFixture();
  unavailable.games = [];
  expect(
    renderToStaticMarkup(<EditorialShowcase selections={[unavailable]} />),
  ).toBe("");
});
