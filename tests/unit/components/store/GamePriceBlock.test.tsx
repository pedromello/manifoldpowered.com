import { renderToStaticMarkup } from "react-dom/server";
import { GamePriceBlock } from "components/store/GamePriceBlock";
import { selectionFixture } from "tests/unit/_fixtures/selection";

test("uses the same flat yellow discount with localized Nintendo prices", () => {
  const game = selectionFixture().games[0];
  Object.assign(game, {
    purchase_mode: "NINTENDO_ONLY",
    external_offer: {
      provider: "NINTENDO",
      amount: "11.99",
      original_amount: "74.95",
      currency: "BRL",
      discount_percent: 84,
      captured_at: new Date().toISOString(),
    },
  });
  const html = renderToStaticMarkup(<GamePriceBlock game={game} />);
  expect(html).toContain("R$11,99");
  expect(html).toContain("R$74,95");
  expect(html).toContain("-84%");
  expect(html).toContain("#FFB400");
  expect(html).toContain("box-shadow:none");
});
test("does not turn missing external prices into free games", () => {
  const game = selectionFixture().games[0];
  Object.assign(game, { purchase_mode: "NINTENDO_ONLY", external_offer: null });
  const html = renderToStaticMarkup(<GamePriceBlock game={game} />);
  expect(html).toContain("Price unavailable");
  expect(html).not.toContain("Free");
});

test("does not advertise Manifold as the seller of an unavailable game", () => {
  const game = selectionFixture().games[0];
  const html = renderToStaticMarkup(<GamePriceBlock game={game} />);
  expect(html).toContain("Price unavailable");
  expect(html).not.toContain("Manifold");
});
