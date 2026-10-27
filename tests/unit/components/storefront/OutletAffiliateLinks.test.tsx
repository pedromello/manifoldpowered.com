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
