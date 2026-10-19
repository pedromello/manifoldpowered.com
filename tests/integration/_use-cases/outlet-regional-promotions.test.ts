import type { NextApiRequest } from "next";
import { prisma } from "infra/database";
import { promotionGameIds } from "models/store_promotions";
import orchestrator from "tests/orchestrator";
import { createReadyDraft } from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(() => orchestrator.waitForAllServices());
beforeEach(() => orchestrator.clearDatabaseRows());
afterAll(() => prisma.$disconnect());

test("regional promotions preserve preferred-market suppression, Nintendo fallback, legacy Steam and curation", async () => {
  const { games } = await createReadyDraft("Regional promotions");
  const now = new Date();
  await prisma.game.updateMany({
    where: { id: { in: games.map(({ id }) => id) } },
    data: {
      status: "ONLY_DISPLAY",
      social_links: { steam_page: "https://store.steampowered.com/app/10" },
      price: 0,
      base_price: null,
    },
  });
  await prisma.game.update({
    where: { id: games[2].id },
    data: {
      nintendo_nsuid: "70010000000001",
      studio_id: null,
      publisher_id: null,
      steam_app_id: null,
      social_links: {},
    },
  });
  await prisma.game.update({
    where: { id: games[3].id },
    data: {
      status: "ACTIVE",
      price: 10,
      base_price: 20,
    },
  });
  await prisma.game.update({
    where: { id: games[5].id },
    data: {
      steam_price: 5,
      steam_original_price: 10,
      steam_discount_percent: 50,
      steam_price_currency: "USD",
      steam_price_captured_at: now,
    },
  });
  await prisma.gameExternalOffer.createMany({
    data: [
      {
        game_id: games[0].id,
        provider: "STEAM",
        country: "BR",
        currency: "BRL",
        amount: 5,
        original_amount: 10,
        discount_percent: 50,
        captured_at: now,
        url: "https://store.steampowered.com/app/10",
      },
      {
        game_id: games[0].id,
        provider: "STEAM",
        country: "US",
        currency: "USD",
        amount: 10,
        original_amount: 10,
        discount_percent: 0,
        captured_at: now,
        url: "https://store.steampowered.com/app/10",
      },
      {
        game_id: games[1].id,
        provider: "STEAM",
        country: "BR",
        currency: "BRL",
        amount: 10,
        original_amount: 10,
        discount_percent: 0,
        captured_at: now,
        url: "https://store.steampowered.com/app/10",
      },
      {
        game_id: games[1].id,
        provider: "STEAM",
        country: "US",
        currency: "USD",
        amount: 5,
        original_amount: 10,
        discount_percent: 50,
        captured_at: now,
        url: "https://store.steampowered.com/app/10",
      },
      {
        game_id: games[2].id,
        provider: "NINTENDO",
        country: "BR",
        currency: "BRL",
        amount: 100,
        original_amount: 200,
        discount_percent: 50,
        captured_at: now,
        url: "https://www.nintendo.com/pt-br/store/products/example-switch/",
      },
      {
        game_id: games[4].id,
        provider: "STEAM",
        country: "BR",
        currency: "BRL",
        amount: 5,
        original_amount: 10,
        discount_percent: 50,
        captured_at: new Date(now.getTime() - 40 * 86_400_000),
        url: "https://store.steampowered.com/app/10",
      },
    ],
  });
  const find = (country: string, curation = {}) =>
    promotionGameIds(
      { headers: { "x-vercel-ip-country": country } } as NextApiRequest,
      curation,
      "USD",
    );
  expect((await find("BR")).sort()).toEqual(
    [0, 2, 3, 5].map((i) => games[i].id).sort(),
  );
  expect((await find("US")).sort()).toEqual(
    [1, 2, 3, 5].map((i) => games[i].id).sort(),
  );
  expect(await find("BR", { id: { in: [games[0].id] } })).toEqual([
    games[0].id,
  ]);
});
