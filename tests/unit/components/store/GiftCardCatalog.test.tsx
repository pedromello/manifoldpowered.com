import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { GiftCardCatalog } from "components/store/GiftCardCatalog";
import GiftCardStorePage, { getServerSideProps } from "pages/store/gift-cards";

jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value, locale: "pt-BR" }),
}));

function render({ buyer = false, available = false, featured = false } = {}) {
  (useSWR as unknown as jest.Mock).mockImplementation((key: string) => ({
    data:
      key === "/api/v1/gift-cards"
        ? {
            products: [
              {
                code: "sandbox-brl-25",
                name: "Demo gift card",
                amount_minor: 2500,
                currency: "BRL",
                gift_card_code: "synthetic-private-code",
              },
            ],
            checkout_available: available,
          }
        : buyer
          ? { id: "synthetic-buyer" }
          : undefined,
    isLoading: false,
    mutate: jest.fn(),
  }));
  return renderToStaticMarkup(<GiftCardCatalog featured={featured} />);
}

test("anonymous visitors see the product and a login return path for the selected card", () => {
  const html = render({ available: true });
  expect(html).toContain("Demo gift card");
  expect(html).toContain("Log in to buy");
  expect(html).toContain(
    "callbackUrl=%2Fpt-BR%2Fstore%2Fgift-cards%3Fproduct%3Dsandbox-brl-25",
  );
  expect(html).not.toContain("synthetic-private-code");
});

test("configured buyers can start checkout while unconfigured buyers see a disabled action", () => {
  expect(render({ buyer: true, available: true })).toContain("Buy");
  const unavailable = render({ buyer: true });
  expect(unavailable).toContain("Purchases unavailable");
  expect(unavailable).toContain('disabled=""');
  const guest = render();
  expect(guest).toContain("Purchases unavailable");
  expect(guest).not.toContain("Log in to buy");
  expect(guest).not.toContain("Checkout");
});

test("dedicated page has one clear heading and explains where to find the code", () => {
  render({ available: true });
  const html = renderToStaticMarkup(<GiftCardStorePage />);
  expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
  expect(html).toContain("Choose your gift card.");
  expect(html).toContain(
    "Find your code in your library after payment confirmation.",
  );
  expect(html).toContain("My gift cards");
});

test("home feature links to the dedicated public gift card store", () => {
  expect(render({ featured: true })).toContain('href="/store/gift-cards"');
});

test("public gift card page remains restricted to demo environments", async () => {
  const original = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    expect(await getServerSideProps()).toEqual({ notFound: true });
  } finally {
    Object.assign(process.env, { NODE_ENV: original });
  }
});
