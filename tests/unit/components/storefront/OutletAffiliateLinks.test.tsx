/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AffiliatePurchaseOptions,
  OutletAffiliateLinks,
} from "components/store/OutletAffiliateLinks";
import { storeContextFromApi } from "components/store/types";
import type { AffiliateLink } from "contracts/outlet-affiliates";
import { trackAffiliateLink } from "lib/product-events-client";
import { I18nProvider } from "lib/i18n";

jest.mock("next/router", () => ({ useRouter: () => ({ locale: "pt-BR" }) }));

jest.mock("lib/product-events-client", () => ({
  trackAffiliateLink: jest.fn(),
}));

const gameLink: AffiliateLink = {
  id: "2e989738-6f24-4aa7-a16b-4ee3e8661bd6",
  kind: "game",
  merchant: "nuuvem",
  platform: "steam",
  media_type: "digital",
  country: "BR",
  game_id: "game-1",
  game_slug: "signal-garden",
  url: "https://www.nuuvem.com/br-pt/item/signal-garden?affiliate=synthetic",
  label: null,
};
const giftLink: AffiliateLink = {
  ...gameLink,
  id: "7b5017f7-e6b5-4e94-ae01-d5469cdf01bc",
  kind: "gift_card",
  merchant: "amazon",
  media_type: null,
  game_id: null,
  game_slug: null,
  url: "https://www.amazon.com.br/dp/SYNTHETIC?tag=sample-20",
};
const generalLink: AffiliateLink = {
  ...giftLink,
  kind: "storefront",
  platform: null,
};
const generalLinks: AffiliateLink[] = [
  {
    ...generalLink,
    id: "c68b5b7b-12d2-4e6f-8a64-814cbead9831",
    merchant: "nuuvem",
    url: "https://www.nuuvem.com/br-pt/",
  },
  generalLink,
  {
    ...generalLink,
    id: "71c55d8b-96e6-4ec1-88b7-06c66162f2be",
    merchant: "mercado_livre",
    url: "https://www.mercadolivre.com.br/?affiliate=synthetic",
  },
];
const store = storeContextFromApi({
  id: "store-1",
  slug: "lantern-club",
  name: "Lantern Club",
  description: null,
  logo_url: null,
  owner_id: "owner",
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
  affiliate_links: [generalLink],
  affiliate_revision_id: "revision-1",
});
let root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  jest.mocked(trackAffiliateLink).mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

function purchase(isPreview = false, links = [gameLink, giftLink]) {
  return (
    <AffiliatePurchaseOptions
      links={links}
      storeSlug={store.slug}
      storeName={store.name}
      gameSlug="signal-garden"
      publishedRevisionId="revision-1"
      isPreview={isPreview}
    />
  );
}

test("primary opens the resolved game destination and identifies gift-card alternatives without copying the official price", async () => {
  await act(async () => root.render(purchase()));
  const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
  expect(links).toHaveLength(2);
  expect(links[0].textContent).toContain("Buy at Nuuvem");
  expect(links[0].href).toBe(gameLink.url);
  expect(links[0].rel).toBe("sponsored noopener noreferrer");
  expect(links[1].textContent).toContain("Gift card · Steam · Brazil");
  expect(document.body.textContent).toContain(
    "buy credit and redeem the game later",
  );
  expect(document.body.textContent).not.toMatch(
    /R\$|\$\d|View support options/,
  );
  await act(async () =>
    links[0].dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(trackAffiliateLink).toHaveBeenCalledTimes(1);
  expect(trackAffiliateLink).toHaveBeenLastCalledWith(
    expect.objectContaining({
      link: gameLink,
      gameSlug: "signal-garden",
      storeSlug: store.slug,
      placement: "purchase_primary",
      publishedRevisionId: "revision-1",
    }),
  );
  await act(async () =>
    links[1].dispatchEvent(
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    ),
  );
  expect(trackAffiliateLink).toHaveBeenCalledTimes(2);
  expect(trackAffiliateLink).toHaveBeenLastCalledWith(
    expect.objectContaining({
      link: giftLink,
      placement: "purchase_alternative",
    }),
  );
  await act(async () =>
    links[1].dispatchEvent(
      new MouseEvent("auxclick", { bubbles: true, button: 2 }),
    ),
  );
  expect(trackAffiliateLink).toHaveBeenCalledTimes(2);
});

test("a gift card primary clearly names its destination and remains different from buying the game", async () => {
  await act(async () => root.render(purchase(false, [giftLink])));
  expect(document.querySelector("a")?.textContent).toContain(
    "Buy a gift card at Amazon",
  );
  expect(document.body.textContent).toContain(
    "Check your account region before buying",
  );
  expect(document.body.textContent).not.toContain("Other options");
});

test("general links alone offer each creator store without promising a specific game, platform, price or gift card", async () => {
  await act(async () => root.render(purchase(false, generalLinks)));
  const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
  expect(links).toHaveLength(3);
  expect(links[0].textContent).toContain("Buy at Nuuvem");
  expect(links[1].textContent).toContain("Buy at Amazon");
  expect(links[2].textContent).toContain("Buy at Mercado Livre");
  expect(links.map((node) => node.href)).toEqual(
    generalLinks.map((link) => link.url),
  );
  expect(document.body.textContent).toContain("Affiliate link · Brazil");
  expect(document.body.textContent).toContain("Mercado Livre");
  expect(document.body.textContent).toContain("Nuuvem");
  expect(document.body.textContent).not.toMatch(
    /View options|Buy a gift card|Digital game|Physical game|Gift card|Steam|R\$|\$\d/,
  );
  await act(async () =>
    links[0].dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(trackAffiliateLink).toHaveBeenLastCalledWith(
    expect.objectContaining({
      gameSlug: "signal-garden",
      placement: "purchase_primary",
      link: expect.objectContaining({
        kind: "storefront",
        platform: null,
        media_type: null,
      }),
    }),
  );
  await act(async () =>
    links[1].dispatchEvent(
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    ),
  );
  expect(trackAffiliateLink).toHaveBeenCalledTimes(2);
  expect(trackAffiliateLink).toHaveBeenLastCalledWith(
    expect.objectContaining({
      gameSlug: "signal-garden",
      placement: "purchase_alternative",
      link: generalLinks[1],
    }),
  );
});

test("resolved purchase links keep games and gift cards ahead of general catalog alternatives", async () => {
  const catalog = generalLinks[2];
  await act(async () =>
    root.render(purchase(false, [gameLink, giftLink, catalog])),
  );
  const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
  expect(links.map((node) => node.href)).toEqual([
    gameLink.url,
    giftLink.url,
    catalog.url,
  ]);
  expect(links[0].textContent).toContain("Buy at Nuuvem");
  expect(links[1].textContent).toContain("Gift card · Steam");
  expect(links[2].textContent).toContain("Affiliate link");
  expect(links[2].textContent).toContain("Buy at Mercado Livre");
});

test("general catalog choices remain disabled and untracked in a private game preview", async () => {
  await act(async () => root.render(purchase(true, generalLinks)));
  expect(document.querySelector("a")).toBeNull();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons).toHaveLength(3);
  expect(buttons.every((node) => node.disabled)).toBe(true);
  expect(buttons[0].textContent).toContain("Buy at Nuuvem");
  await act(async () => {
    for (const node of buttons) node.click();
  });
  expect(trackAffiliateLink).not.toHaveBeenCalled();
});

test("Portuguese fallback uses direct purchase actions with the correct merchant preposition", async () => {
  await act(async () =>
    root.render(<I18nProvider>{purchase(false, generalLinks)}</I18nProvider>),
  );
  const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
  expect(links[0].textContent).toContain("Comprar na Nuuvem");
  expect(links[1].textContent).toContain("Comprar na Amazon");
  expect(links[2].textContent).toContain("Comprar no Mercado Livre");
  expect(document.body.textContent).toContain("Link de afiliado · Brasil");
  expect(document.body.textContent).not.toMatch(
    /Ver opções|Comprar gift card|Jogo digital|Catálogo do criador/,
  );
});

test("preview shows disabled destinations and does not collect clicks", async () => {
  await act(async () =>
    root.render(
      <>
        <OutletAffiliateLinks store={store} isPreview />
        {purchase(true)}
      </>,
    ),
  );
  expect(document.querySelector("a")).toBeNull();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons).toHaveLength(3);
  expect(buttons.every((button) => button.disabled)).toBe(true);
  await act(async () => {
    for (const button of buttons) button.click();
  });
  expect(trackAffiliateLink).not.toHaveBeenCalled();
});

test("general outlet links are measured without inventing a game attribution", async () => {
  await act(async () => root.render(<OutletAffiliateLinks store={store} />));
  const link = document.querySelector<HTMLAnchorElement>("a")!;
  expect(link.textContent).toContain("Amazon");
  await act(async () =>
    link.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(trackAffiliateLink).toHaveBeenCalledTimes(1);
  expect(trackAffiliateLink).toHaveBeenCalledWith(
    expect.objectContaining({
      placement: "outlet_links",
      storeSlug: store.slug,
      gameSlug: undefined,
    }),
  );
});

test("empty or invalid destinations do not render a purchase panel", async () => {
  await act(async () =>
    root.render(purchase(false, [{ ...gameLink, url: "javascript:alert(1)" }])),
  );
  expect(document.querySelector("section")).toBeNull();
});
